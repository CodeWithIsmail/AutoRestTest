import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Payload sent to engine-service `POST /runs`. */
export interface EngineRunPayload {
  spec: string;
  targetUrl: string;
  timeBudget: number;
  mutationRate: number;
  authHeader?: string;
}

export type EngineJobState = 'pending' | 'running' | 'completed' | 'failed';

export interface EngineJob {
  jobId: string;
  status: EngineJobState;
  error: string | null;
}

/** One operation's aggregated outcome, joined with method/path by the service. */
export interface EngineOperationResult {
  operationId: string;
  method: string | null;
  path: string | null;
  statusCodes: Record<string, number>;
  totalRequests: number;
  passed: boolean;
  serverErrors: unknown[];
}

/** One captured request/response from the recording proxy. */
export interface EngineRequestRecord {
  seq: number;
  timestamp: string;
  method: string;
  path: string;
  url: string;
  endpointPath: string | null;
  statusCode: number | null;
  durationMs: number | null;
  requestHeaders: Record<string, string> | null;
  requestBody: string | null;
  requestTruncated: boolean;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  responseTruncated: boolean;
}

/** Options sent alongside the source archive to `POST /generations`. */
export interface EngineGenerationOptions {
  title: string;
  version: string;
  /** Directory names the pipeline should not walk into. */
  ignorePath?: string[];
}

/** Status of a codebase-to-OpenAPI generation job. */
export interface EngineGenerationJob extends EngineJob {
  sourceName: string;
  warnings: string[];
  /** Raw pipeline step name, e.g. "run_swagger_generation". */
  step: string | null;
  /** Human-readable step name for the UI. */
  stepLabel: string | null;
  stepIndex: number;
  stepTotal: number;
}

export interface EngineGenerationResult {
  /** The generated document, serialized as JSON. */
  openapi: string;
  /** "swagger2" when the OAS 3 upgrade step could not run (no JRE). */
  format: 'oas3' | 'swagger2';
  operationCount: number;
  warnings: string[];
}

export interface EngineResult {
  summary: {
    totalOperations: number;
    successfullyProcessed: number;
    coveragePct: number;
    totalRequests: number;
    statusCodeDistribution: Record<string, number>;
    uniqueServerErrors: number;
    operationsWithServerErrors: number;
  };
  operations: EngineOperationResult[];
  operationStatusCodes: unknown;
  serverErrors: unknown;
  rawReport: unknown;
}

/**
 * Thin HTTP client for the Python `engine-service`. Uses the global `fetch`
 * (Node 18+); translates transport/HTTP failures into a 503 so callers surface
 * a clean error when the engine is down.
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(config: ConfigService) {
    // Default to 127.0.0.1 (not "localhost") so Node's fetch doesn't resolve to
    // IPv6 ::1 while the Python service listens on IPv4 only.
    this.baseUrl = (
      config.get<string>('ENGINE_SERVICE_URL') ?? 'http://127.0.0.1:5000'
    ).replace(/\/+$/, '');
    this.token = config.get<string>('ENGINE_SERVICE_TOKEN') || undefined;
  }

  async startRun(payload: EngineRunPayload): Promise<EngineJob> {
    return this.request<EngineJob>('POST', '/runs', payload);
  }

  async getStatus(jobId: string): Promise<EngineJob> {
    return this.request<EngineJob>('GET', `/runs/${jobId}`);
  }

  async getResult(jobId: string): Promise<EngineResult> {
    return this.request<EngineResult>('GET', `/runs/${jobId}/result`);
  }

  /** Fetch every request/response captured by the recording proxy for a run. */
  async getRequests(jobId: string): Promise<EngineRequestRecord[]> {
    const res = await this.request<{ requests: EngineRequestRecord[] }>(
      'GET',
      `/runs/${jobId}/requests`,
    );
    return res.requests ?? [];
  }

  // -- spec generation (upload a codebase, get an OpenAPI document) --------- //

  /**
   * Upload a source archive and queue a generation. Sent as multipart rather
   * than JSON because the archive is binary and can be tens of megabytes;
   * base64 in a JSON body would inflate it by a third for no benefit.
   */
  async startGeneration(
    file: { buffer: Buffer; originalname: string },
    opts: EngineGenerationOptions,
  ): Promise<EngineGenerationJob> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: 'application/zip' }),
      file.originalname,
    );
    form.append('title', opts.title);
    form.append('version', opts.version);
    if (opts.ignorePath?.length) {
      form.append('ignorePath', opts.ignorePath.join(','));
    }

    const headers: Record<string, string> = {};
    if (this.token) headers['X-Service-Token'] = this.token;

    let res: Response;
    try {
      // No Content-Type header: the runtime sets it with the multipart boundary.
      res = await fetch(`${this.baseUrl}/generations`, {
        method: 'POST',
        headers,
        body: form,
      });
    } catch (err) {
      this.logger.error(`engine-service unreachable: ${String(err)}`);
      throw new ServiceUnavailableException('Spec generator is unavailable');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(
        `engine-service POST /generations -> ${res.status} ${text}`,
      );
      // Archive rejections (bad zip, too large, too many files) are the user's
      // to fix, so pass them through instead of masking them as a 503.
      if (res.status === 400 || res.status === 413) {
        throw new BadRequestException(
          this.errorMessageOf(text) ?? 'The source archive was rejected',
        );
      }
      throw new ServiceUnavailableException(
        `Spec generator returned ${res.status}`,
      );
    }

    return (await res.json()) as EngineGenerationJob;
  }

  async getGenerationStatus(jobId: string): Promise<EngineGenerationJob> {
    return this.request<EngineGenerationJob>('GET', `/generations/${jobId}`);
  }

  async getGenerationResult(jobId: string): Promise<EngineGenerationResult> {
    return this.request<EngineGenerationResult>(
      'GET',
      `/generations/${jobId}/result`,
    );
  }

  /** Best-effort cleanup of a generation's working directory. */
  async deleteGeneration(jobId: string): Promise<void> {
    try {
      await this.request('DELETE', `/generations/${jobId}`);
    } catch {
      // The row is going away regardless; a stale job directory is harmless.
    }
  }

  /** Pull the `error` field out of an engine-service JSON error body. */
  private errorMessageOf(text: string): string | null {
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      return typeof parsed.error === 'string' ? parsed.error : null;
    } catch {
      return null;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers['X-Service-Token'] = this.token;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`engine-service unreachable: ${String(err)}`);
      throw new ServiceUnavailableException('Test engine is unavailable');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(
        `engine-service ${method} ${path} -> ${res.status} ${text}`,
      );
      throw new ServiceUnavailableException(
        `Test engine returned ${res.status}`,
      );
    }

    return (await res.json()) as T;
  }
}

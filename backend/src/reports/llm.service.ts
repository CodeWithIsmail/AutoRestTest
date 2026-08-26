import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmSettingsService } from '../llm-settings/llm-settings.service';

/** Input describing a failed endpoint, used to prompt the explanation. */
export interface FailureContext {
  method: string;
  path: string;
  statusCodes: Record<string, number>;
  serverErrors: unknown[];
}

/** One captured request/response pair to be described in plain language. */
export interface RequestDescriptionInput {
  id: string;
  /** Method actually sent — may differ from the operation's, that is a mutation. */
  method: string;
  /** Concrete path hit, e.g. /pets/%20fluffy%20. */
  path: string;
  url: string;
  requestHeaders: Record<string, string> | null;
  requestBody: string | null;
  /** The matched operation, or null when no declared operation accepts this. */
  endpointMethod: string | null;
  /** Templated path, e.g. /pets/{slug}. Without it, parameters cannot be named. */
  endpointPath: string | null;
  /** What the spec declares for that operation, when the spec could be read. */
  spec?: OperationSpec | null;
}

/** Mirrors OperationSpec in test-suites/spec-params.ts (structural, not imported
 * as a type dependency, so the reports module stays free of spec parsing). */
export interface OperationSpec {
  summary?: string;
  fields: {
    name: string;
    in: string;
    type?: string;
    required?: boolean;
    format?: string;
    enum?: unknown[];
    maxLength?: number;
    minLength?: number;
    minimum?: number;
    maximum?: number;
  }[];
  contentTypes?: string[];
  requiresAuth?: boolean;
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/** Keeps a single prompt bounded no matter how large the captured payload is. */
const BODY_PROMPT_LIMIT = 600;

/** Said explicitly, because it is a finding: the method was probably mutated. */
const NO_OPERATION = 'no declared operation matches this method and path';

/** Headers that are part of a test's intent even though they are standard. */
const INTENT_HEADERS = new Set(['content-type', 'accept', 'x-api-key']);

/** Transport noise — present on every request, meaningful on none. */
const STANDARD_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'user-agent',
  'date',
  'via',
  'expect',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  'keep-alive',
]);

/**
 * The engine's mutations are a fixed, small set (MutationAgent.mutate_values in
 * autoresttest-core/src/autoresttest/marl/marl.py). Naming them turns an
 * open-ended writing task into something close to classification: the model
 * picks the one it can see evidence of and names the field it hit. That is what
 * makes the descriptions consistent across a run rather than merely fluent.
 */
const DESCRIBE_SYSTEM_PROMPT = [
  'You are a REST API testing assistant. For each captured HTTP request, write ONE short sentence (at most 15 words) naming what that test case checks.',
  '',
  'Refer to fields by location and name: path_params.<name>, query_params.<name>, body.<name>, headers.<Name>. Use the names from the specification, not invented ones.',
  '',
  'The requests were produced by a fuzzer that applies these mutations. Identify which one the evidence shows, and say so:',
  '- a value of the wrong JSON type for a declared field',
  '- a boundary value: empty string, whitespace only, the literal "null"/"undefined", a 10000-character string, a NUL byte, "%s%s%s", "{{", integer/float extremes, an empty or 1000-element array, an empty object',
  '- a value violating a declared constraint (maxLength, minLength, minimum, maximum, enum, format)',
  '- a required field omitted, or an undeclared field added',
  '- a parameter sent in the wrong location (query/header/cookie instead of where it belongs)',
  '- a missing or malformed Authorization header',
  '- an unsupported Content-Type',
  '- an HTTP method the operation does not declare (the operation will be reported as unmatched)',
  '- none of the above: valid input, often an id reused from an earlier response',
  '',
  'Describe the INPUT, never the outcome. You are deliberately not shown the response: never mention status codes, errors, or whether the test passed.',
  '',
  'Examples of the required register:',
  `"Test with leading and trailing spaces for 'path_params.slug' field"`,
  '"Test with wrong HTTP method"',
  `"Test with an empty 'body.name' field"`,
  `"Test with a 10000-character 'body.title' exceeding its 50-character limit"`,
  '"Test without an authorization header"',
  `"Test with an unsupported 'text/plain' content type"`,
  `"Test with an integer value for the string field 'query_params.name'"`,
  '"Test fetching a pet by a valid id"',
  '',
  'Reply with JSON only, in the form {"results":[{"id":"<id>","description":"<sentence>"}]}, covering every id given.',
].join('\n');

/**
 * Small OpenRouter-compatible chat client used to turn a failed endpoint's raw
 * data into a plain-language explanation. `LLM_MODE=mock` returns a
 * deterministic canned explanation so the feature works offline with no key.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly mode: string;
  private readonly envApiKey?: string;

  constructor(
    config: ConfigService,
    private readonly llmSettings: LlmSettingsService,
  ) {
    this.mode = (config.get<string>('LLM_MODE') ?? 'real').toLowerCase();
    this.envApiKey = config.get<string>('LLM_API_KEY') || undefined;
  }

  get isMock(): boolean {
    return this.mode === 'mock';
  }

  /**
   * Earliest wall-clock time the next request may *start*. Both features share
   * it because they share a key, and therefore a quota: LlmService is a single
   * provider instance (ReportsModule exports it, TestSuitesModule imports it),
   * so one budget covers "Explain failures" and "Explain requests" together.
   */
  private nextSlotAt = 0;

  /**
   * Holds the caller until its turn, spacing request *starts* 60s/rpm apart.
   *
   * Pacing from the start rather than sleeping a fixed amount after each reply
   * is what makes this an actual rpm ceiling — a slow response spends its own
   * interval instead of adding to it. The slot is claimed synchronously before
   * the await, so concurrent callers queue behind each other rather than all
   * reading the same free slot.
   */
  private async reserveSlot(rpm: number): Promise<void> {
    if (rpm <= 0) return;
    const interval = Math.ceil(60_000 / rpm);
    const now = Date.now();
    const slot = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slot + interval;
    if (slot > now) {
      await new Promise((resolve) => setTimeout(resolve, slot - now));
    }
  }

  /**
   * Throws if a real explanation is requested but no key is configured,
   * whether from the admin settings page or LLM_API_KEY.
   */
  async assertUsable(): Promise<void> {
    if (this.isMock) return;
    const { apiKey } = await this.llmSettings.getReportExplanationSettings();
    if (!apiKey && !this.envApiKey) {
      throw new ServiceUnavailableException(
        'LLM is not configured (set an API key from /admin/llm-settings, or LLM_API_KEY, or LLM_MODE=mock)',
      );
    }
  }

  async explainFailure(ctx: FailureContext): Promise<string> {
    if (this.isMock) {
      return this.mockExplanation(ctx);
    }

    const prompt = this.buildPrompt(ctx);
    const { model, apiBase, apiKey, rpmLimit } =
      await this.llmSettings.getReportExplanationSettings();
    await this.reserveSlot(rpmLimit);
    try {
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey ?? this.envApiKey ?? ''}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content:
                'You are a REST API testing assistant. Explain, in 2-3 plain sentences for a non-expert, why an endpoint likely failed and what to check. Be concrete and avoid jargon.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`LLM ${res.status}: ${text}`);
        return this.fallback(ctx);
      }

      const data = (await res.json()) as ChatCompletion;
      const content = data.choices?.[0]?.message?.content?.trim();
      return content || this.fallback(ctx);
    } catch (err) {
      this.logger.error(`LLM request failed: ${String(err)}`);
      return this.fallback(ctx);
    }
  }

  /**
   * Describe a batch of captured requests in one call.
   *
   * Returns a map of request id -> one-sentence description. Ids the model did
   * not answer for are simply absent; the caller leaves those rows undescribed
   * so a later invocation can retry them. Never throws — a failed call returns
   * an empty map rather than losing the run.
   */
  async describeRequests(
    batch: RequestDescriptionInput[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (batch.length === 0) return out;

    if (this.isMock) {
      for (const r of batch) {
        out.set(
          r.id,
          `Sends ${r.method} ${r.path} and expects a valid response (mock description).`,
        );
      }
      return out;
    }

    const { model, apiBase, apiKey, rpmLimit } =
      await this.llmSettings.getReportExplanationSettings();
    await this.reserveSlot(rpmLimit);

    try {
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey ?? this.envApiKey ?? ''}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: DESCRIBE_SYSTEM_PROMPT,
            },
            { role: 'user', content: this.buildDescribePrompt(batch) },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`LLM describe ${res.status}: ${text}`);
        return out;
      }

      const data = (await res.json()) as ChatCompletion;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return out;

      const parsed = JSON.parse(content) as {
        results?: { id?: unknown; description?: unknown }[];
      };
      const known = new Set(batch.map((r) => r.id));
      for (const row of parsed.results ?? []) {
        const id = typeof row.id === 'string' ? row.id : null;
        const description =
          typeof row.description === 'string' ? row.description.trim() : '';
        // Ignore ids we did not ask about, and refuse a paragraph where a
        // sentence was requested.
        if (!id || !known.has(id)) continue;
        if (!description || description.length > 200) continue;
        out.set(id, description);
      }
      return out;
    } catch (err) {
      this.logger.error(`LLM describe request failed: ${String(err)}`);
      return out;
    }
  }

  private buildDescribePrompt(batch: RequestDescriptionInput[]): string {
    const items = batch.map((r) => this.describeItem(r));

    // The declared schema is per operation, and a batch is ordered so it
    // usually covers one — so emit it once rather than repeating it per item.
    const specs = new Map<string, OperationSpec>();
    for (const r of batch) {
      const key = this.operationOf(r);
      if (r.spec && !specs.has(key)) specs.set(key, r.spec);
    }

    const parts: string[] = [];
    if (specs.size > 0) {
      parts.push(
        `What the API specification declares for the operations below:
${JSON.stringify(Object.fromEntries(specs), null, 1)}`,
      );
    }
    parts.push(
      `Describe each of these ${batch.length} test cases:
${JSON.stringify(items, null, 1)}`,
    );
    return parts.join('\n\n');
  }

  /** `PUT /pets/{slug}`, or an explicit marker when nothing in the spec matches. */
  private operationOf(r: RequestDescriptionInput): string {
    return r.endpointMethod && r.endpointPath
      ? `${r.endpointMethod} ${r.endpointPath}`
      : NO_OPERATION;
  }

  /**
   * One request, decomposed. Binding sent values to their declared parameter
   * names is deterministic work, so it is done here rather than left for the
   * model to infer from a raw URL — which is what made earlier descriptions
   * generic.
   */
  private describeItem(r: RequestDescriptionInput): Record<string, unknown> {
    const item: Record<string, unknown> = {
      id: r.id,
      operation: this.operationOf(r),
      sent: `${r.method} ${decodeSafe(r.path)}`,
    };

    const pathParams = this.pathParamsOf(r);
    if (pathParams) item.path_params = pathParams;

    const query = this.queryParamsOf(r.url);
    if (Object.keys(query).length > 0) item.query_params = query;

    const headers = this.headersOf(r.requestHeaders);
    if (Object.keys(headers).length > 0) item.headers = headers;

    const body = truncate(r.requestBody);
    if (body) item.body = body;

    return item;
  }

  /**
   * Match the concrete path against the template segment by segment. A segment
   * count mismatch is reported rather than swallowed: it means the request did
   * not have the shape the operation declares, which is itself the test.
   */
  private pathParamsOf(
    r: RequestDescriptionInput,
  ): Record<string, string> | string | null {
    if (!r.endpointPath) return null;
    const template = r.endpointPath.split('/');
    const actual = r.path.split('/');
    if (template.length !== actual.length) {
      return 'path shape does not match the template';
    }

    const params: Record<string, string> = {};
    for (let i = 0; i < template.length; i++) {
      const seg = template[i];
      if (seg.startsWith('{') && seg.endsWith('}')) {
        params[seg.slice(1, -1)] = decodeSafe(actual[i]);
      }
    }
    return Object.keys(params).length > 0 ? params : null;
  }

  private queryParamsOf(url: string): Record<string, string> {
    const out: Record<string, string> = {};
    const q = url.indexOf('?');
    if (q === -1) return out;
    // Parse the query directly: `url` can be a relative or malformed value that
    // the URL constructor would reject outright.
    for (const pair of url.slice(q + 1).split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = decodeSafe(eq === -1 ? pair : pair.slice(0, eq));
      out[key] = eq === -1 ? '' : decodeSafe(pair.slice(eq + 1));
    }
    return out;
  }

  /**
   * Only headers that carry test intent. Authorization is reduced to
   * present/absent — whether a token was sent is the whole signal, and the
   * token itself must not leave the deployment.
   */
  private headersOf(
    headers: Record<string, string> | null,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers) return out;
    for (const [rawKey, value] of Object.entries(headers)) {
      const key = rawKey.toLowerCase();
      if (key === 'authorization' || key === 'cookie') {
        out[rawKey] = 'present';
      } else if (INTENT_HEADERS.has(key) || !STANDARD_HEADERS.has(key)) {
        out[rawKey] = String(value).slice(0, 120);
      }
    }
    return out;
  }

  private buildPrompt(ctx: FailureContext): string {
    const dist = Object.entries(ctx.statusCodes)
      .map(([code, count]) => `${code}: ${count}`)
      .join(', ');
    const errors =
      Array.isArray(ctx.serverErrors) && ctx.serverErrors.length > 0
        ? JSON.stringify(ctx.serverErrors).slice(0, 1500)
        : 'none captured';
    return [
      `Endpoint: ${ctx.method} ${ctx.path}`,
      `Status code distribution: ${dist || 'none'}`,
      `Server errors: ${errors}`,
      'Explain why this endpoint failed its tests and what a developer should check.',
    ].join('\n');
  }

  private mockExplanation(ctx: FailureContext): string {
    const codes = Object.keys(ctx.statusCodes);
    const has5xx = codes.some((c) => Math.floor(Number(c) / 100) === 5);
    if (has5xx) {
      return `The ${ctx.method} ${ctx.path} endpoint returned server errors (5xx), which means the API crashed or hit an unhandled exception while processing the request. Check the server logs for that route and validate how it handles the generated inputs. (mock explanation)`;
    }
    return `The ${ctx.method} ${ctx.path} endpoint never returned a successful (2xx) response — observed statuses were ${codes.join(', ') || 'none'}. This usually points to invalid inputs, missing auth, or a wrong request shape. Review the endpoint's required parameters and body. (mock explanation)`;
  }

  private fallback(ctx: FailureContext): string {
    return `${ctx.method} ${ctx.path} did not return a successful response. Review the endpoint's expected inputs and server logs.`;
  }
}

/** Percent-decoding is what exposes the mutation: `%20fluffy%20` is padding. */
function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function truncate(value: string | null): string | null {
  if (!value) return null;
  return value.length > BODY_PROMPT_LIMIT
    ? `${value.slice(0, BODY_PROMPT_LIMIT)}…(truncated)`
    : value;
}

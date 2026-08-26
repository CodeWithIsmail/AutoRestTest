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
  method: string;
  path: string;
  url: string;
  requestBody: string | null;
  statusCode: number | null;
  responseBody: string | null;
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/** Keeps a single prompt bounded no matter how large the captured payload is. */
const BODY_PROMPT_LIMIT = 600;

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
    const { model, apiBase, apiKey } =
      await this.llmSettings.getReportExplanationSettings();
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
          max_tokens: 300,
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

    const { model, apiBase, apiKey } =
      await this.llmSettings.getReportExplanationSettings();

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
          max_tokens: 900,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a REST API testing assistant. For each captured HTTP request you are given, write ONE short sentence (at most 15 words) describing what that test case checks — the intent, not a restatement of the URL. Prefer phrasing like "Test with an empty title field" or "Test fetching a user by a valid id". Reply with JSON only, in the form {"results":[{"id":"<id>","description":"<sentence>"}]}, covering every id given.',
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
    const items = batch.map((r) => ({
      id: r.id,
      request: `${r.method} ${r.path}${this.queryOf(r.url)}`,
      requestBody: truncate(r.requestBody),
      status: r.statusCode ?? 'no response',
      responseBody: truncate(r.responseBody),
    }));
    return `Describe each of these ${batch.length} test cases:
${JSON.stringify(items, null, 1)}`;
  }

  /** The query string carries most of the test intent for GETs — keep it. */
  private queryOf(url: string): string {
    const q = url.indexOf('?');
    return q === -1 ? '' : url.slice(q);
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

function truncate(value: string | null): string | null {
  if (!value) return null;
  return value.length > BODY_PROMPT_LIMIT
    ? `${value.slice(0, BODY_PROMPT_LIMIT)}…(truncated)`
    : value;
}

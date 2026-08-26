import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmScope } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLlmSettingsDto } from './dto/update-llm-settings.dto';

export interface LlmSettingsRow {
  scope: LlmScope;
  model: string | null;
  apiBase: string | null;
  rpmLimit: number | null;
  apiKey: string | null;
  updatedAt: Date | null;
}

const SELECT = {
  scope: true,
  model: true,
  apiBase: true,
  rpmLimit: true,
  apiKey: true,
  updatedAt: true,
} as const;

/** Requests per minute allowed to the explanation/description LLM by default. */
const DEFAULT_RPM_LIMIT = 13;

const SCOPES: LlmScope[] = [
  LlmScope.TEST_ENGINE,
  LlmScope.SPEC_GENERATION,
  LlmScope.REPORT_EXPLANATION,
];

/**
 * Every live-editable LLM setting, including the API key, for one of the
 * platform's three LLM surfaces — changeable from the admin settings page
 * with no redeploy or restart.
 *
 * A field left null/absent means "no admin override — fall back to that
 * surface's environment default". For TEST_ENGINE/SPEC_GENERATION that
 * default lives in engine-service's own env (a separate, possibly
 * differently-hosted process), so an unset field is simply omitted from the
 * request to engine-service rather than guessed at here — including the API
 * key, which travels the same way `customHeaders` already does for the
 * target API's credentials. REPORT_EXPLANATION runs in this same process, so
 * its null case resolves against this service's own ConfigService instead.
 */
@Injectable()
export class LlmSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** All three scopes, in a fixed order, for the admin settings page. */
  async listAll(): Promise<LlmSettingsRow[]> {
    const rows = await this.prisma.llmSettings.findMany({ select: SELECT });
    const byScope = new Map(rows.map((r) => [r.scope, r]));
    return SCOPES.map((scope) => byScope.get(scope) ?? this.emptyRow(scope));
  }

  /** The raw DB override for one scope, or an all-null row if none is set. */
  async getOverride(scope: LlmScope): Promise<LlmSettingsRow> {
    const row = await this.prisma.llmSettings.findUnique({
      where: { scope },
      select: SELECT,
    });
    return row ?? this.emptyRow(scope);
  }

  /**
   * Resolved settings for both in-process LLM features — failure explanations
   * and test-case descriptions. Unlike the other two scopes, this one always
   * returns a usable model/apiBase/rpmLimit: the DB override merged over this
   * same process's env vars. `apiKey` stays null when unset — the caller falls
   * back to its own env-sourced key, exactly as before this override existed.
   *
   * `rpmLimit` defaults to 13 rather than 0/unlimited because the free tier
   * this runs against allows 15 requests a minute, and a describe pass issues
   * calls in a tight loop. Unlimited is opt-in (set the field to 0), not the
   * accident you get by leaving it blank.
   */
  async getReportExplanationSettings(): Promise<{
    model: string;
    apiBase: string;
    apiKey: string | null;
    rpmLimit: number;
  }> {
    const override = await this.getOverride(LlmScope.REPORT_EXPLANATION);
    const apiBase =
      override.apiBase ??
      this.config.get<string>('LLM_API_BASE') ??
      'https://openrouter.ai/api/v1';
    return {
      model:
        override.model ??
        this.config.get<string>('LLM_ENGINE') ??
        'google/gemini-2.5-flash-lite',
      apiBase: apiBase.replace(/\/+$/, ''),
      apiKey: override.apiKey,
      rpmLimit: override.rpmLimit ?? this.envRpmLimit(),
    };
  }

  /** `LLM_RPM_LIMIT` from env, falling back to 13. Never negative. */
  private envRpmLimit(): number {
    const parsed = parseInt(this.config.get<string>('LLM_RPM_LIMIT') ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RPM_LIMIT;
    return parsed;
  }

  /**
   * Partial update: a key omitted from `dto` keeps its existing value, a key
   * present with `null` clears the override, and a key present with a value
   * sets it. Distinguishing "omitted" from "explicit null" is why this reads
   * the existing row and checks `in dto` rather than `dto.field ?? existing`,
   * which would collapse "not sent" and "sent as null" into the same thing.
   */
  async upsert(
    scope: LlmScope,
    dto: UpdateLlmSettingsDto,
  ): Promise<LlmSettingsRow> {
    const existing = await this.prisma.llmSettings.findUnique({
      where: { scope },
      select: SELECT,
    });

    const pick = <K extends keyof UpdateLlmSettingsDto>(key: K) =>
      key in dto ? (dto[key] ?? null) : (existing?.[key] ?? null);

    const data = {
      model: pick('model'),
      apiBase: pick('apiBase'),
      rpmLimit: pick('rpmLimit'),
      apiKey: pick('apiKey'),
    };

    return this.prisma.llmSettings.upsert({
      where: { scope },
      create: { scope, ...data },
      update: data,
      select: SELECT,
    });
  }

  private emptyRow(scope: LlmScope): LlmSettingsRow {
    return {
      scope,
      model: null,
      apiBase: null,
      rpmLimit: null,
      apiKey: null,
      updatedAt: null,
    };
  }
}

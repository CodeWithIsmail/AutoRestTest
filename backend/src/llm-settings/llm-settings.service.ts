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
  maxTokens: number | null;
  creativeTemperature: number | null;
  strictTemperature: number | null;
  apiKey: string | null;
  updatedAt: Date | null;
}

const SELECT = {
  scope: true,
  model: true,
  apiBase: true,
  rpmLimit: true,
  maxTokens: true,
  creativeTemperature: true,
  strictTemperature: true,
  apiKey: true,
  updatedAt: true,
} as const;

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
   * Resolved model/API base/key for the Reports explainer. Unlike the other
   * two scopes, this one always returns a usable model/apiBase: the DB
   * override merged over this same process's `LLM_ENGINE`/`LLM_API_BASE` env
   * vars. `apiKey` stays null when unset — the caller falls back to its own
   * env-sourced key, exactly as before this override existed.
   */
  async getReportExplanationSettings(): Promise<{
    model: string;
    apiBase: string;
    apiKey: string | null;
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
    };
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
      maxTokens: pick('maxTokens'),
      creativeTemperature: pick('creativeTemperature'),
      strictTemperature: pick('strictTemperature'),
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
      maxTokens: null,
      creativeTemperature: null,
      strictTemperature: null,
      apiKey: null,
      updatedAt: null,
    };
  }
}

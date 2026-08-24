// Typed wrappers around the admin-only LLM settings endpoints. Every field is
// nullable: null means "no admin override — that surface's own environment
// default applies" (see the backend's LlmSettingsService for what that
// resolves to per scope), not zero/empty.

import { apiFetch } from "./api";

export type LlmScope = "TEST_ENGINE" | "SPEC_GENERATION" | "REPORT_EXPLANATION";

export interface LlmSettingsRow {
  scope: LlmScope;
  model: string | null;
  apiBase: string | null;
  rpmLimit: number | null;
  /** Only meaningful for TEST_ENGINE. */
  maxTokens: number | null;
  creativeTemperature: number | null;
  strictTemperature: number | null;
  apiKey: string | null;
  updatedAt: string | null;
}

export interface UpdateLlmSettingsInput {
  model?: string | null;
  apiBase?: string | null;
  rpmLimit?: number | null;
  maxTokens?: number | null;
  creativeTemperature?: number | null;
  strictTemperature?: number | null;
  apiKey?: string | null;
}

export function listLlmSettings(signal?: AbortSignal): Promise<LlmSettingsRow[]> {
  return apiFetch<LlmSettingsRow[]>("/admin/llm-settings", { signal });
}

export function updateLlmSettings(
  scope: LlmScope,
  input: UpdateLlmSettingsInput,
): Promise<LlmSettingsRow> {
  return apiFetch<LlmSettingsRow>(`/admin/llm-settings/${scope}`, {
    method: "PATCH",
    body: input,
  });
}

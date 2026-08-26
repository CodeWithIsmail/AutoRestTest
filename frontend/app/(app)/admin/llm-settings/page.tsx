"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { errMsg } from "@/lib/api";
import {
  type LlmScope,
  type LlmSettingsRow,
  type UpdateLlmSettingsInput,
  updateLlmSettings,
} from "@/lib/llm-settings";
import { llmSettingsOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const SCOPE_LABEL: Record<LlmScope, string> = {
  TEST_ENGINE: "Test engine",
  SPEC_GENERATION: "Spec generation",
  REPORT_EXPLANATION: "Explanation generation",
};

const SCOPE_DESCRIPTION: Record<LlmScope, string> = {
  TEST_ENGINE:
    "The autoresttest-core MARL engine's value generation, driven through engine-service.",
  SPEC_GENERATION:
    "The OOPS pipeline that turns an uploaded codebase into an OpenAPI spec.",
  REPORT_EXPLANATION:
    "Failure explanations on a run's report, and the plain-language test-case descriptions behind “Explain requests”.",
};

/**
 * The value each field currently resolves to when left blank here — i.e.
 * what's actually configured in that surface's own environment right now.
 * Shown as the input's placeholder so leaving a field empty is legibly "keep
 * today's value" rather than a blank unknown.
 */
const SCOPE_PLACEHOLDERS: Record<LlmScope, FormState> = {
  TEST_ENGINE: {
    model: "openai/gpt-oss-20b",
    apiBase: "https://integrate.api.nvidia.com/v1",
    rpmLimit: "unlimited",
    apiKey: "using engine-service's API_KEY",
  },
  SPEC_GENERATION: {
    model: "gemini-3.5-flash-lite",
    apiBase: "https://generativelanguage.googleapis.com/v1beta/openai/",
    rpmLimit: "12",
    apiKey: "using engine-service's OOPS_API_KEY",
  },
  REPORT_EXPLANATION: {
    model: "google/gemini-2.5-flash-lite",
    apiBase: "https://openrouter.ai/api/v1",
    rpmLimit: "13",
    apiKey: "using backend's LLM_API_KEY",
  },
};

/** Local editable form state; `""` means "unset — use the environment default". */
interface FormState {
  model: string;
  apiBase: string;
  rpmLimit: string;
  apiKey: string;
}

function toFormState(row: LlmSettingsRow): FormState {
  return {
    model: row.model ?? "",
    apiBase: row.apiBase ?? "",
    rpmLimit: row.rpmLimit === null ? "" : String(row.rpmLimit),
    apiKey: row.apiKey ?? "",
  };
}

function toUpdateInput(form: FormState): UpdateLlmSettingsInput {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return {
    model: form.model.trim() === "" ? null : form.model.trim(),
    apiBase: form.apiBase.trim() === "" ? null : form.apiBase.trim(),
    rpmLimit: num(form.rpmLimit),
    apiKey: form.apiKey.trim() === "" ? null : form.apiKey.trim(),
  };
}

export default function LlmSettingsPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  // The backend enforces this on every request; this is only to keep a
  // non-admin from seeing a page that will just 403 underneath them.
  if (!user.isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Admin access required
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your account is not on the ADMIN_EMAILS allowlist for this
          deployment.
        </p>
      </div>
    );
  }

  return <LlmSettingsForm />;
}

function LlmSettingsForm() {
  const { data, isPending, error } = useQuery(llmSettingsOptions());

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-16 text-center text-sm text-red-600 dark:text-red-400">
        {errMsg(error, "Could not load LLM settings")}
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          LLM settings
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Live overrides for model, API key, API base, and rate limit —
          applied to the next run/generation/explanation, no restart needed.
          Leave a field empty to fall back to that surface&apos;s environment
          default.
        </p>
      </div>

      {data.map((row) => (
        <ScopeCard key={row.scope} row={row} />
      ))}
    </div>
  );
}

function ScopeCard({ row }: { row: LlmSettingsRow }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toFormState(row));

  const saveMutation = useMutation({
    mutationFn: () => updateLlmSettings(row.scope, toUpdateInput(form)),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        qk.llmSettings,
        (rows: LlmSettingsRow[] | undefined) =>
          rows?.map((r) => (r.scope === updated.scope ? updated : r)),
      );
      setForm(toFormState(updated));
      toast.success(`${SCOPE_LABEL[row.scope]} settings saved.`);
    },
    onError: (err) => toast.error(errMsg(err, "Could not save settings")),
  });

  const placeholder = SCOPE_PLACEHOLDERS[row.scope];
  const submitting = saveMutation.isPending;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {SCOPE_LABEL[row.scope]}
      </h2>
      <p className="mt-0.5 text-sm text-zinc-500">
        {SCOPE_DESCRIPTION[row.scope]}
      </p>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Model"
            placeholder={placeholder.model}
            value={form.model}
            onChange={(e) => set("model", e.target.value)}
          />
          <FormField
            label="API base URL"
            placeholder={placeholder.apiBase}
            value={form.apiBase}
            onChange={(e) => set("apiBase", e.target.value)}
          />
        </div>

        <FormField
          label="API key"
          type="password"
          autoComplete="off"
          placeholder={placeholder.apiKey}
          value={form.apiKey}
          onChange={(e) => set("apiKey", e.target.value)}
        />

        <div>
          <FormField
            label="RPM limit"
            type="number"
            min={0}
            placeholder={placeholder.rpmLimit}
            value={form.rpmLimit}
            onChange={(e) => set("rpmLimit", e.target.value)}
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Requests per minute. 0 removes the limit.
          </p>
        </div>

        <div>
          <Button type="submit" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}

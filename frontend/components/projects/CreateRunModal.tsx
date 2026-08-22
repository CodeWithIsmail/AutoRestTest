"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { FIELD_CLASS, FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { errMsg } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { createSuite } from "@/lib/test-suites";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TestSuiteDetail } from "@/lib/types";

interface CreateRunModalProps {
  projectId: string;
  onClose: () => void;
  onCreated: (suite: TestSuiteDetail) => void;
}

interface HeaderRow {
  key: string;
  value: string;
}

const MAX_HEADERS = 20;

const HEADER_NAME_SUGGESTIONS = [
  "Authorization",
  "X-Api-Key",
  "Api-Key",
  "X-Auth-Token",
  "Cookie",
  "Accept",
  "X-Requested-With",
];

export function CreateRunModal({
  projectId,
  onClose,
  onCreated,
}: CreateRunModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [timeBudget, setTimeBudget] = useState("30");
  const [mutationRate, setMutationRate] = useState("");
  const [showHeaders, setShowHeaders] = useState(false);
  const [headers, setHeaders] = useState<HeaderRow[]>([]);

  function updateHeader(index: number, field: keyof HeaderRow, value: string) {
    setHeaders((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function removeHeader(index: number) {
    setHeaders((rows) => rows.filter((_, i) => i !== index));
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const customHeaders = Object.fromEntries(
        headers
          .filter((row) => row.key.trim() !== "")
          .map((row) => [row.key.trim(), row.value]),
      );
      return createSuite(projectId, {
        name: name.trim() || undefined,
        targetUrl: targetUrl.trim(),
        timeBudget: Number(timeBudget),
        mutationRate:
          mutationRate.trim() === "" ? undefined : Number(mutationRate),
        customHeaders:
          Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
      });
    },
    onSuccess: (suite) => {
      toast.success("Run created.");
      // Seed the detail the caller is about to navigate to, so the run page
      // opens with data instead of a spinner.
      queryClient.setQueryData(qk.suites.detail(projectId, suite.id), suite);
      void queryClient.invalidateQueries({ queryKey: qk.suites.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      onCreated(suite);
    },
    onError: (err) => toast.error(errMsg(err, "Something went wrong")),
  });

  const submitting = createMutation.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New test run"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="run-form" loading={submitting}>
            Create
          </Button>
        </>
      }
    >
      <form id="run-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          label="Name (optional)"
          name="name"
          placeholder="Smoke run"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <FormField
          label="Target URL"
          name="targetUrl"
          type="url"
          placeholder="https://api.example.com"
          required
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
        />
        <p className="-mt-2 text-xs text-zinc-500">
          The live base URL the engine sends requests to.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Time budget (seconds)"
            name="timeBudget"
            type="number"
            min={1}
            max={3600}
            required
            value={timeBudget}
            onChange={(e) => setTimeBudget(e.target.value)}
          />
          <FormField
            label="Mutation rate (0–1)"
            name="mutationRate"
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="0.2"
            value={mutationRate}
            onChange={(e) => setMutationRate(e.target.value)}
          />
        </div>

        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setShowHeaders((v) => !v)}
            className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            {showHeaders ? "▾" : "▸"} Advanced: Custom headers
            {headers.length > 0 && !showHeaders
              ? ` (${headers.length})`
              : null}
          </button>

          {showHeaders && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs text-zinc-500">
                Sent with every request to the target API. Add any header the
                API expects — for example <code>Authorization</code> for
                Basic/Bearer auth, or an API-key header like{" "}
                <code>X-Api-Key</code>.
              </p>
              <datalist id="header-name-suggestions">
                {HEADER_NAME_SUGGESTIONS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {headers.length > 0 && (
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-0.5 text-xs font-medium text-zinc-500">
                  <span>Key</span>
                  <span>Value</span>
                  <span />
                </div>
              )}
              {headers.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    aria-label="Header name"
                    placeholder="Authorization"
                    maxLength={100}
                    list="header-name-suggestions"
                    value={row.key}
                    onChange={(e) => updateHeader(i, "key", e.target.value)}
                    className={`h-9 min-w-0 ${FIELD_CLASS}`}
                  />
                  <input
                    aria-label="Header value"
                    placeholder="Basic dXNlcjpwYXNz"
                    maxLength={4000}
                    value={row.value}
                    onChange={(e) => updateHeader(i, "value", e.target.value)}
                    className={`h-9 min-w-0 font-mono ${FIELD_CLASS}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Remove header"
                    className="shrink-0 px-2.5"
                    onClick={() => removeHeader(i)}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={headers.length >= MAX_HEADERS}
                onClick={() =>
                  setHeaders((rows) => [...rows, { key: "", value: "" }])
                }
              >
                + Add header
              </Button>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

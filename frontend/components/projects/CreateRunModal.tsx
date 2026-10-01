"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge, MethodBadge } from "@/components/ui/Badge";
import { errMsg } from "@/lib/api";
import { endpointsOptions, suitesOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import { createSuite } from "@/lib/test-suites";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  "Content-Type",
  "X-Requested-With",
];

const TIME_PRESETS = [
  { value: "300", label: "5 min" },
  { value: "600", label: "10 min" },
  { value: "900", label: "15 min" },
  { value: "1200", label: "20 min" },
  { value: "1500", label: "25 min" },
];

function formatDuration(secStr: string): string {
  const n = Number(secStr);
  if (!n || isNaN(n)) return "0s";
  if (n >= 60 && n % 60 === 0) {
    return `${n / 60} min`;
  }
  if (n >= 60) {
    const mins = Math.floor(n / 60);
    const rem = n % 60;
    return `${mins}m ${rem}s`;
  }
  return `${n}s`;
}

function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ClockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function KeyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m21 2-2 2m-1.5 1.5L16 7l-2 2-2.5-.5L9 11l-7 7v4h4l7-7 2.5-2.5L20 10l1.5-1.5" />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

function FilterIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ChevronDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
    </svg>
  );
}

function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function CreateRunModal({
  projectId,
  onClose,
  onCreated,
}: CreateRunModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [enteredTargetUrl, setEnteredTargetUrl] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState("300");

  const [showHeaders, setShowHeaders] = useState(false);
  const [headers, setHeaders] = useState<HeaderRow[]>([]);

  const [showEndpoints, setShowEndpoints] = useState(false);
  const [endpointSearch, setEndpointSearch] = useState("");
  const [excludedEndpointIds, setExcludedEndpointIds] = useState<Set<string>>(
    new Set(),
  );

  const { data: endpoints } = useQuery(endpointsOptions(projectId));
  const { data: suites } = useQuery(suitesOptions(projectId));

  // Find previous target URL to give intelligent suggestions
  const previousTargetUrl = useMemo(() => {
    return suites?.find((s) => s.targetUrl)?.targetUrl ?? "";
  }, [suites]);

  const targetUrl =
    enteredTargetUrl !== null ? enteredTargetUrl : previousTargetUrl;

  function toggleEndpoint(id: string) {
    setExcludedEndpointIds((ids) => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function includeAllEndpoints() {
    setExcludedEndpointIds(new Set());
  }

  function excludeAllEndpoints() {
    if (!endpoints) return;
    setExcludedEndpointIds(new Set(endpoints.map((ep) => ep.id)));
  }

  function updateHeader(index: number, field: keyof HeaderRow, value: string) {
    setHeaders((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function removeHeader(index: number) {
    setHeaders((rows) => rows.filter((_, i) => i !== index));
  }

  function addPresetHeader(key: string, value = "") {
    if (headers.length >= MAX_HEADERS) return;
    setShowHeaders(true);
    setHeaders((rows) => {
      if (
        rows.length > 0 &&
        !rows[rows.length - 1].key.trim() &&
        !rows[rows.length - 1].value.trim()
      ) {
        const next = [...rows];
        next[next.length - 1] = { key, value };
        return next;
      }
      return [...rows, { key, value }];
    });
  }

  const filteredEndpoints = useMemo(() => {
    if (!endpoints) return [];
    const q = endpointSearch.trim().toLowerCase();
    if (!q) return endpoints;
    return endpoints.filter(
      (ep) =>
        ep.path.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q),
    );
  }, [endpoints, endpointSearch]);

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
        timeBudget: Number(timeBudget) || 300,
        customHeaders:
          Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
        excludedEndpointIds:
          excludedEndpointIds.size > 0
            ? Array.from(excludedEndpointIds)
            : undefined,
      });
    },
    onSuccess: (suite) => {
      toast.success("Test run initiated.");
      queryClient.setQueryData(qk.suites.detail(projectId, suite.id), suite);
      void queryClient.invalidateQueries({
        queryKey: qk.suites.list(projectId),
      });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      onCreated(suite);
    },
    onError: (err) => toast.error(errMsg(err, "Failed to start test run")),
  });

  const submitting = createMutation.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetUrl.trim()) {
      toast.error("Please provide a target API base URL.");
      return;
    }
    createMutation.mutate();
  }

  const totalEndpoints = endpoints?.length ?? 0;
  const activeEndpointCount = totalEndpoints - excludedEndpointIds.size;
  const validHeadersCount = headers.filter((h) => h.key.trim() !== "").length;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New test run"
      footer={
        <div className="flex w-full items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="run-form"
            loading={submitting}
            disabled={!targetUrl.trim()}
          >
            {submitting ? "Creating…" : "Create"}
          </Button>
        </div>
      }
    >
      <form id="run-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Name */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="runName"
              className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
            >
              Name <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            {name.length > 0 && (
              <span className="text-xs text-zinc-400">{name.length}/100</span>
            )}
          </div>
          <input
            id="runName"
            name="name"
            type="text"
            maxLength={100}
            placeholder="Smoke run"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        {/* Target URL */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="targetUrl"
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
            >
              <span>Target URL</span>
              <span className="text-emerald-600 dark:text-emerald-400">*</span>
            </label>
            {previousTargetUrl && targetUrl !== previousTargetUrl && (
              <button
                type="button"
                onClick={() => setEnteredTargetUrl(previousTargetUrl)}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
              >
                <span>Use last:</span>
                <code className="max-w-[190px] truncate rounded bg-emerald-50 px-1 py-0.5 font-mono text-[11px] text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {previousTargetUrl}
                </code>
              </button>
            )}
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
              <GlobeIcon className="h-4 w-4" />
            </div>
            <input
              id="targetUrl"
              name="targetUrl"
              type="url"
              required
              placeholder="https://api.example.com"
              value={targetUrl}
              onChange={(e) => setEnteredTargetUrl(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
        </div>

        {/* Time Budget */}
        <div className="space-y-2 rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ClockIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                Time Budget
              </span>
            </div>
            <span className="text-xs text-zinc-500">
              Duration:{" "}
              <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
                {formatDuration(timeBudget)}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {TIME_PRESETS.map((preset) => {
              const active = timeBudget === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setTimeBudget(preset.value)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    active
                      ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-600"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}

            {/* Custom Input */}
            <div className="relative ml-auto flex items-center">
              <input
                type="number"
                min={1}
                max={3600}
                required
                value={timeBudget}
                onChange={(e) => setTimeBudget(e.target.value)}
                className="h-8 w-24 rounded-lg border border-zinc-300 bg-white pr-8 pl-2 text-right font-mono text-xs text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <span className="pointer-events-none absolute right-2 text-[11px] font-medium text-zinc-400">
                sec
              </span>
            </div>
          </div>
        </div>

        {/* Collapsible Card 1: Custom Headers */}
        <div className="overflow-hidden rounded-xl border border-zinc-200/90 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setShowHeaders((v) => !v)}
            className="flex w-full items-center justify-between bg-zinc-50/80 px-4 py-3 text-left transition-colors hover:bg-zinc-100/70 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/60"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <KeyIcon className="h-3.5 w-3.5" />
              </div>
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Custom Headers
              </div>
            </div>
            <div className="flex items-center gap-2">
              {validHeadersCount > 0 ? (
                <Badge tone="emerald">{validHeadersCount} configured</Badge>
              ) : (
                <Badge tone="zinc">Optional</Badge>
              )}
              <ChevronDownIcon
                className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                  showHeaders ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {showHeaders && (
            <div className="space-y-3 border-t border-zinc-200/80 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-950/40">
              {/* Quick Add Presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-zinc-500 text-[11px] font-medium">Quick add:</span>
                <button
                  type="button"
                  onClick={() => addPresetHeader("Authorization", "Bearer ")}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400 transition-colors"
                >
                  + Bearer Token
                </button>
                <button
                  type="button"
                  onClick={() => addPresetHeader("X-Api-Key", "")}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400 transition-colors"
                >
                  + API Key
                </button>
                <button
                  type="button"
                  onClick={() => addPresetHeader("Accept", "application/json")}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400 transition-colors"
                >
                  + JSON Accept
                </button>
              </div>

              <datalist id="header-name-suggestions">
                {HEADER_NAME_SUGGESTIONS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              {headers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-200 py-4 text-center dark:border-zinc-800">
                  <p className="text-xs text-zinc-500">No custom headers added</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1.2fr_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    <span>Header Name</span>
                    <span>Value</span>
                    <span className="w-8" />
                  </div>
                  {headers.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1.2fr_auto] items-center gap-2">
                      <input
                        aria-label="Header name"
                        placeholder="e.g. Authorization"
                        maxLength={100}
                        list="header-name-suggestions"
                        value={row.key}
                        onChange={(e) => updateHeader(i, "key", e.target.value)}
                        className="h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <input
                        aria-label="Header value"
                        placeholder="e.g. Bearer eyJhbGciOi..."
                        maxLength={4000}
                        value={row.value}
                        onChange={(e) => updateHeader(i, "value", e.target.value)}
                        className="h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <button
                        type="button"
                        aria-label="Remove header"
                        title="Remove header"
                        onClick={() => removeHeader(i)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={headers.length >= MAX_HEADERS}
                    onClick={() =>
                      setHeaders((rows) => [...rows, { key: "", value: "" }])
                    }
                    className="mt-1"
                  >
                    + Add Another Header
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Card 2: Endpoint Scope */}
        {endpoints && endpoints.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-zinc-200/90 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setShowEndpoints((v) => !v)}
              className="flex w-full items-center justify-between bg-zinc-50/80 px-4 py-3 text-left transition-colors hover:bg-zinc-100/70 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/60"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <FilterIcon className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Endpoint Scope
                </div>
              </div>
              <div className="flex items-center gap-2">
                {excludedEndpointIds.size === 0 ? (
                  <Badge tone="emerald">All {totalEndpoints} active</Badge>
                ) : (
                  <Badge tone="amber">
                    {activeEndpointCount} of {totalEndpoints} active
                  </Badge>
                )}
                <ChevronDownIcon
                  className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                    showEndpoints ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>

            {showEndpoints && (
              <div className="space-y-3 border-t border-zinc-200/80 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                {/* Search & Bulk selection toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative min-w-0 flex-1">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="search"
                      placeholder="Filter endpoints by path or method…"
                      value={endpointSearch}
                      onChange={(e) => setEndpointSearch(e.target.value)}
                      className="h-8 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={includeAllEndpoints}
                      className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 transition-colors"
                    >
                      Include All
                    </button>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <button
                      type="button"
                      onClick={excludeAllEndpoints}
                      className="rounded px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
                    >
                      Exclude All
                    </button>
                  </div>
                </div>

                {/* Endpoints checklist */}
                <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {filteredEndpoints.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-500">
                      No endpoints matching &quot;{endpointSearch}&quot;
                    </div>
                  ) : (
                    filteredEndpoints.map((ep) => {
                      const isIncluded = !excludedEndpointIds.has(ep.id);
                      return (
                        <label
                          key={ep.id}
                          className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => toggleEndpoint(ep.id)}
                            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 dark:border-zinc-700 dark:bg-zinc-900"
                          />
                          <MethodBadge method={ep.method} />
                          <span
                            className={`truncate font-mono ${
                              isIncluded
                                ? "text-zinc-900 dark:text-zinc-100 font-medium"
                                : "text-zinc-400 line-through dark:text-zinc-500"
                            }`}
                          >
                            {ep.path}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

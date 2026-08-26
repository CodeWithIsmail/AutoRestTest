"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { useProject } from "@/components/projects/project-context";
import { useToast } from "@/components/toast";
import { Badge, MethodBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { errMsg } from "@/lib/api";
import { buildCurlCommand } from "@/lib/curl";
import {
  requestLogOptions,
  requestLogSummaryOptions,
  requestLogsOptions,
} from "@/lib/queries";
import { runRequestLog } from "@/lib/request-logs";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { RequestLogDetail, RunRequestLogResult } from "@/lib/types";

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "2xx", label: "2xx" },
  { key: "3xx", label: "3xx" },
  { key: "4xx", label: "4xx" },
  { key: "5xx", label: "5xx" },
];

/** Exact codes and status classes share one `status` value (and one query
 *  param), so picking one clears the other. This tells them apart. */
const EXACT_CODE = /^\d{3}$/;

/** HTTP status code → badge tone. */
function httpTone(code: number | null): "emerald" | "blue" | "amber" | "red" | "zinc" {
  if (code == null) return "zinc";
  if (code < 300) return "emerald";
  if (code < 400) return "blue";
  if (code < 500) return "amber";
  return "red";
}

/** Pretty-print a JSON body; fall back to the raw string if it isn't JSON. */
function pretty(body: string | null): string {
  if (!body) return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function HeadersBlock({
  label,
  headers,
}: {
  label: string;
  headers: Record<string, string> | null;
}) {
  const entries = Object.entries(headers ?? {});
  return (
    <details className="group">
      <summary className="mb-1 flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 select-none [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        {label}
        {entries.length > 0 && (
          <span className="font-normal normal-case text-zinc-400">
            ({entries.length})
          </span>
        )}
      </summary>
      {entries.length === 0 ? (
        <p className="text-xs text-zinc-500">No headers.</p>
      ) : (
        <div className="flex max-h-96 flex-col gap-0.5 overflow-auto rounded-md bg-white dark:bg-zinc-950 p-3 font-mono text-xs ring-1 ring-zinc-200 dark:ring-zinc-800">
          {entries.map(([k, v]) => (
            <div key={k} className="break-all">
              <span className="text-zinc-600 dark:text-zinc-400">{k}:</span>{" "}
              <span className="text-zinc-700 dark:text-zinc-300">{v}</span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function BodyBlock({
  body,
  truncated,
}: {
  body: string | null;
  truncated: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  if (!body) return <p className="text-xs text-zinc-500">Empty body.</p>;

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(pretty(body));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — your browser blocked clipboard access.");
    }
  }

  return (
    <div className="group/body relative">
      <pre className="max-h-96 overflow-auto rounded-md bg-white dark:bg-zinc-950 p-3 pr-9 font-mono text-xs text-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-zinc-800">
        {pretty(body)}
      </pre>
      <button
        type="button"
        onClick={copyBody}
        title={copied ? "Copied" : "Copy body"}
        className="absolute right-2 top-2 rounded-md p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-zinc-700 focus-visible:opacity-100 group-hover/body:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
        ) : (
          <CopyIcon className="h-3.5 w-3.5" />
        )}
      </button>
      {truncated && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Body was truncated for storage.
        </p>
      )}
    </div>
  );
}

type LiveRunState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: RunRequestLogResult };

function DetailPanel({
  detail,
  canRun,
  live,
  onRun,
}: {
  detail: RequestLogDetail;
  canRun: boolean;
  live: LiveRunState | undefined;
  onRun: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(buildCurlCommand(detail));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (detail.requestTruncated) {
        toast.error(
          "Copied, but the captured request body was truncated — the curl command's body is incomplete.",
        );
      }
    } catch {
      toast.error("Copy failed — your browser blocked clipboard access.");
    }
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40">
      <div className="flex items-center justify-end gap-2 border-b border-zinc-200 dark:border-zinc-800 px-5 py-2.5">
        <button
          type="button"
          onClick={copyCurl}
          title={copied ? "Copied" : "Copy as curl"}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
          Copy as curl
        </button>
        <Button
          variant="secondary"
          size="sm"
          loading={live?.status === "loading"}
          disabled={!canRun}
          title={
            canRun ? undefined : "Requires admin or tester role on this project"
          }
          onClick={onRun}
        >
          Run
        </Button>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MethodBadge method={detail.method} />
            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 break-all">
              {detail.url}
            </span>
          </div>
          <HeadersBlock label="Request headers" headers={detail.requestHeaders} />
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Request body
            </p>
            <BodyBlock body={detail.requestBody} truncated={detail.requestTruncated} />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge tone={httpTone(detail.statusCode)}>
              {detail.statusCode ?? "—"}
            </Badge>
            {detail.durationMs != null && (
              <span className="text-xs text-zinc-500">{detail.durationMs} ms</span>
            )}
          </div>
          <HeadersBlock label="Response headers" headers={detail.responseHeaders} />
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Response body
            </p>
            <BodyBlock
              body={detail.responseBody}
              truncated={detail.responseTruncated}
            />
          </div>
        </div>
      </div>

      {live && (
        <div className="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Badge tone="purple">Live response</Badge>
            {live.status === "done" && (
              <span className="text-xs text-zinc-500">
                Ran at {new Date(live.result.ranAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {live.status === "loading" && (
            <div className="flex justify-center py-4">
              <Spinner className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
            </div>
          )}
          {live.status === "error" && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {live.message}
            </p>
          )}
          {live.status === "done" && (
            <>
              <div className="flex items-center gap-2">
                <Badge tone={httpTone(live.result.statusCode)}>
                  {live.result.statusCode ?? "—"}
                </Badge>
                <span className="text-xs text-zinc-500">
                  {live.result.durationMs} ms
                </span>
              </div>
              {live.result.error && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Target unreachable: {live.result.error}
                </p>
              )}
              <div className="grid gap-5 lg:grid-cols-2">
                <HeadersBlock
                  label="Response headers"
                  headers={live.result.responseHeaders}
                />
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Response body
                  </p>
                  <BodyBlock
                    body={live.result.responseBody}
                    truncated={live.result.responseTruncated}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CapturedRequestsPage() {
  const { project, canRun } = useProject();
  const router = useRouter();
  const { suiteId, endpointId } = useParams<{
    suiteId: string;
    endpointId: string;
  }>();

  // The route segment is "all" | "unmatched" | <endpoint uuid>.
  const apiEndpointId = endpointId === "all" ? undefined : endpointId;

  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RequestLogDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [liveRuns, setLiveRuns] = useState<Record<string, LiveRunState>>({});
  const [confirmRunId, setConfirmRunId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const runMutation = useMutation({
    mutationFn: (logId: string) => runRequestLog(project.id, suiteId, logId),
    onMutate: (logId) => {
      setLiveRuns((m) => ({ ...m, [logId]: { status: "loading" } }));
    },
    onSuccess: (result, logId) => {
      setLiveRuns((m) => ({ ...m, [logId]: { status: "done", result } }));
    },
    onError: (err, logId) => {
      setLiveRuns((m) => ({
        ...m,
        [logId]: { status: "error", message: errMsg(err, "Run failed") },
      }));
    },
  });

  // GET/HEAD run immediately; anything that could have real side effects on
  // the target API is gated behind an extra confirmation click.
  function startRun(id: string, method: string) {
    const m = method.toUpperCase();
    if (m === "GET" || m === "HEAD") {
      runMutation.mutate(id);
    } else {
      setConfirmRunId(id);
    }
  }

  const { data, isPending, isFetching, error } = useQuery({
    ...requestLogsOptions(project.id, suiteId, {
      endpointId: apiEndpointId,
      status: status || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    // Keeps the current rows on screen while the next page loads instead of
    // collapsing the table to a spinner. Same pager, same layout.
    placeholderData: keepPreviousData,
  });

  // Summary drives the heading (method/path for a specific endpoint).
  const { data: summary } = useQuery(
    requestLogSummaryOptions(project.id, suiteId),
  );

  const suiteLink = `/projects/${project.id}/test-suites/${suiteId}`;

  const endpointMeta =
    apiEndpointId && apiEndpointId !== "unmatched"
      ? summary?.find((s) => s.endpointId === apiEndpointId)
      : undefined;

  const title =
    endpointId === "unmatched"
      ? "Unmatched requests"
      : endpointId === "all"
        ? "All captured requests"
        : endpointMeta
          ? `${endpointMeta.method} ${endpointMeta.path}`
          : "Endpoint requests";

  // Every code seen anywhere in the run, so switching endpoints doesn't make
  // options appear and disappear underneath the cursor.
  const codeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const s of summary ?? []) {
      for (const code of Object.keys(s.statusCodes ?? {})) seen.add(code);
    }
    return [...seen].sort((a, b) => Number(a) - Number(b));
  }, [summary]);

  function chooseStatus(key: string) {
    setStatus(key);
    setPage(1);
    setExpandedId(null);
  }

  /** Endpoint is a route segment, so switching navigates — that keeps every
   *  filtered view deep-linkable. */
  function chooseEndpoint(segment: string) {
    router.push(`${suiteLink}/requests/${segment}`);
  }

  async function toggle(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setDetailError(null);
    if (!details[id]) {
      setDetailLoading(true);
      try {
        // `fetchQuery` rather than a bare call so a row that has already been
        // expanded once (in this session or a previous visit) resolves from
        // the cache instead of going back to the server.
        const d = await queryClient.fetchQuery(
          requestLogOptions(project.id, suiteId, id),
        );
        setDetails((m) => ({ ...m, [id]: d }));
      } catch (err) {
        setDetailError(errMsg(err, "Failed to load request"));
      } finally {
        setDetailLoading(false);
      }
    }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={suiteLink} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Back to run
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {endpointMeta && <MethodBadge method={endpointMeta.method ?? ""} />}
          <h2 className="font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Every request the engine sent{" "}
          {endpointId === "all" ? "during this run" : "to this endpoint"}, with
          the full request and response.
        </p>
      </div>

      {/* Filters: endpoint, status class, exact response code */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select
          size="sm"
          value={endpointId}
          onChange={chooseEndpoint}
          aria-label="Filter by endpoint"
          className="max-w-xs"
          options={[
            { value: "all", label: "All requests" },
            ...(summary ?? []).map((s) =>
              s.endpointId === null
                ? { value: "unmatched", label: `Unmatched (${s.total})` }
                : {
                    value: s.endpointId,
                    label: `${s.method} ${s.path} (${s.total})`,
                  },
            ),
          ]}
        />

        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => chooseStatus(f.key)}
              aria-pressed={status === f.key}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                status === f.key
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {codeOptions.length > 0 && (
          <Select
            size="sm"
            value={EXACT_CODE.test(status) ? status : ""}
            onChange={chooseStatus}
            aria-label="Filter by HTTP response code"
            options={[
              { value: "", label: "Any code" },
              ...codeOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
        )}
      </div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            {errMsg(error, "Failed to load captured requests")}
          </p>
        </Card>
      ) : !data || data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No captured requests
            {status
              ? EXACT_CODE.test(status)
                ? ` returned ${status}`
                : ` with a ${status} status`
              : ""}
            .
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const open = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => toggle(r.id)}
                        className={`cursor-pointer border-b border-zinc-200 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 ${
                          open ? "bg-zinc-100 dark:bg-zinc-800/40" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                          {r.seq}
                        </td>
                        <td className="px-4 py-3">
                          <MethodBadge method={r.method} />
                        </td>
                        <td className="px-4 py-3 max-w-md">
                          {r.description ? (
                            <>
                              <span className="text-zinc-800 dark:text-zinc-200">
                                {r.description}
                              </span>
                              <span className="mt-0.5 block font-mono text-xs text-zinc-500 break-all">
                                {r.path}
                              </span>
                            </>
                          ) : (
                            <span className="font-mono text-zinc-800 dark:text-zinc-200 break-all">
                              {r.path}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={httpTone(r.statusCode)}>
                            {r.statusCode ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500">
                          {r.durationMs != null ? `${r.durationMs} ms` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-500">
                          {open ? "▲" : "▼"}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            {detailLoading && !details[r.id] ? (
                              <div className="flex justify-center py-8">
                                <Spinner className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
                              </div>
                            ) : detailError && !details[r.id] ? (
                              <p className="p-5 text-sm text-red-600 dark:text-red-400">
                                {detailError}
                              </p>
                            ) : details[r.id] ? (
                              <DetailPanel
                                detail={details[r.id]}
                                canRun={canRun}
                                live={liveRuns[r.id]}
                                onRun={() =>
                                  startRun(r.id, details[r.id].method)
                                }
                              />
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  setExpandedId(null);
                }}
              >
                Previous
              </Button>
              <span className="text-xs text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => {
                  setPage((p) => p + 1);
                  setExpandedId(null);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmRunId !== null}
        title="Run this request?"
        message="This sends a live request to the target API and may cause real side effects (data changes, side effects on the target system). Continue?"
        confirmLabel="Run"
        danger
        loading={runMutation.isPending}
        onConfirm={() => {
          if (confirmRunId) runMutation.mutate(confirmRunId);
          setConfirmRunId(null);
        }}
        onClose={() => setConfirmRunId(null)}
      />
    </div>
  );
}

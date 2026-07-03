"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useState } from "react";
import { useProject } from "@/components/projects/project-context";
import { Badge, MethodBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { getRequestLog, getRequestLogSummary, listRequestLogs } from "@/lib/request-logs";
import { useApi } from "@/lib/useApi";
import type { RequestLogDetail } from "@/lib/types";

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "2xx", label: "2xx" },
  { key: "3xx", label: "3xx" },
  { key: "4xx", label: "4xx" },
  { key: "5xx", label: "5xx" },
];

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
  headers,
}: {
  headers: Record<string, string> | null;
}) {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) {
    return <p className="text-xs text-zinc-500">No headers.</p>;
  }
  return (
    <div className="flex flex-col gap-0.5 font-mono text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="break-all">
          <span className="text-zinc-400">{k}:</span>{" "}
          <span className="text-zinc-300">{v}</span>
        </div>
      ))}
    </div>
  );
}

function BodyBlock({
  body,
  truncated,
}: {
  body: string | null;
  truncated: boolean;
}) {
  if (!body) return <p className="text-xs text-zinc-500">Empty body.</p>;
  return (
    <div>
      <pre className="max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-xs text-zinc-300 ring-1 ring-zinc-800">
        {pretty(body)}
      </pre>
      {truncated && (
        <p className="mt-1 text-xs text-amber-400">
          Body was truncated for storage.
        </p>
      )}
    </div>
  );
}

function DetailPanel({ detail }: { detail: RequestLogDetail }) {
  return (
    <div className="grid gap-5 border-t border-zinc-800 bg-zinc-900/40 p-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MethodBadge method={detail.method} />
          <span className="font-mono text-xs text-zinc-400 break-all">
            {detail.url}
          </span>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Request headers
          </p>
          <HeadersBlock headers={detail.requestHeaders} />
        </div>
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
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Response headers
          </p>
          <HeadersBlock headers={detail.responseHeaders} />
        </div>
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
  );
}

export default function CapturedRequestsPage() {
  const { project } = useProject();
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

  const { data, loading, error } = useApi(
    () =>
      listRequestLogs(project.id, suiteId, {
        endpointId: apiEndpointId,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [project.id, suiteId, apiEndpointId, status, page],
  );

  // Summary drives the heading (method/path for a specific endpoint).
  const { data: summary } = useApi(
    () => getRequestLogSummary(project.id, suiteId),
    [project.id, suiteId],
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

  function chooseStatus(key: string) {
    setStatus(key);
    setPage(1);
    setExpandedId(null);
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
        const d = await getRequestLog(project.id, suiteId, id);
        setDetails((m) => ({ ...m, [id]: d }));
      } catch (err) {
        setDetailError(
          err instanceof ApiError ? err.message : "Failed to load request",
        );
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
        <Link href={suiteLink} className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to run
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {endpointMeta && <MethodBadge method={endpointMeta.method ?? ""} />}
          <h2 className="font-mono text-lg font-semibold text-zinc-50">
            {title}
          </h2>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Every request the engine sent{" "}
          {endpointId === "all" ? "during this run" : "to this endpoint"}, with
          the full request and response.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => chooseStatus(f.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              status === f.key
                ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-emerald-500" />
        </div>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      ) : !data || data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-zinc-400">
            No captured requests{status ? ` with a ${status} status` : ""}.
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Path</th>
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
                        className={`cursor-pointer border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 ${
                          open ? "bg-zinc-800/40" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                          {r.seq}
                        </td>
                        <td className="px-4 py-3">
                          <MethodBadge method={r.method} />
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-200 break-all">
                          {r.path}
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
                                <Spinner className="h-5 w-5 text-emerald-500" />
                              </div>
                            ) : detailError && !details[r.id] ? (
                              <p className="p-5 text-sm text-red-400">
                                {detailError}
                              </p>
                            ) : details[r.id] ? (
                              <DetailPanel detail={details[r.id]} />
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
          <div className="flex items-center justify-between text-sm text-zinc-400">
            <span>
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1 || loading}
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
                disabled={page >= totalPages || loading}
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
    </div>
  );
}

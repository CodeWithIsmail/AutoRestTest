// Typed wrappers around the /projects/:id/test-suites/:suiteId/request-logs
// endpoints — the requests captured by the recording proxy during a run.

import { apiFetch } from "./api";
import type {
  RequestLogDetail,
  RequestLogEndpointSummary,
  RequestLogPage,
  RunRequestLogResult,
} from "./types";

export function getRequestLogSummary(
  projectId: string,
  suiteId: string,
  signal?: AbortSignal,
): Promise<RequestLogEndpointSummary[]> {
  return apiFetch<RequestLogEndpointSummary[]>(
    `/projects/${projectId}/test-suites/${suiteId}/request-logs/summary`,
    { signal },
  );
}

export function listRequestLogs(
  projectId: string,
  suiteId: string,
  opts: {
    endpointId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  } = {},
  signal?: AbortSignal,
): Promise<RequestLogPage> {
  const qs = new URLSearchParams();
  if (opts.endpointId) qs.set("endpointId", opts.endpointId);
  if (opts.status) qs.set("status", opts.status);
  if (opts.page) qs.set("page", String(opts.page));
  if (opts.pageSize) qs.set("pageSize", String(opts.pageSize));
  const query = qs.toString();
  return apiFetch<RequestLogPage>(
    `/projects/${projectId}/test-suites/${suiteId}/request-logs${
      query ? `?${query}` : ""
    }`,
    { signal },
  );
}

export function getRequestLog(
  projectId: string,
  suiteId: string,
  logId: string,
  signal?: AbortSignal,
): Promise<RequestLogDetail> {
  return apiFetch<RequestLogDetail>(
    `/projects/${projectId}/test-suites/${suiteId}/request-logs/${logId}`,
    { signal },
  );
}

/** Live-sends one captured request against the target. Ephemeral — nothing is persisted. */
export function runRequestLog(
  projectId: string,
  suiteId: string,
  logId: string,
): Promise<RunRequestLogResult> {
  return apiFetch<RunRequestLogResult>(
    `/projects/${projectId}/test-suites/${suiteId}/request-logs/${logId}/run`,
    { method: "POST" },
  );
}

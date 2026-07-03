// Typed wrappers around the /projects/:id/test-suites/:suiteId/request-logs
// endpoints — the requests captured by the recording proxy during a run.

import { apiFetch } from "./api";
import type {
  RequestLogDetail,
  RequestLogEndpointSummary,
  RequestLogPage,
} from "./types";

export function getRequestLogSummary(
  projectId: string,
  suiteId: string,
): Promise<RequestLogEndpointSummary[]> {
  return apiFetch<RequestLogEndpointSummary[]>(
    `/projects/${projectId}/test-suites/${suiteId}/request-logs/summary`,
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
  );
}

export function getRequestLog(
  projectId: string,
  suiteId: string,
  logId: string,
): Promise<RequestLogDetail> {
  return apiFetch<RequestLogDetail>(
    `/projects/${projectId}/test-suites/${suiteId}/request-logs/${logId}`,
  );
}

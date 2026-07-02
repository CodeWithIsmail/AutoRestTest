// Typed wrappers around the report endpoints (under a completed test suite).

import { apiDownload, apiFetch } from "./api";
import type { ReportEndpoint, SuiteReport } from "./types";

export function getReport(
  projectId: string,
  suiteId: string,
): Promise<SuiteReport> {
  return apiFetch<SuiteReport>(
    `/projects/${projectId}/test-suites/${suiteId}/report`,
  );
}

export function explainFailures(
  projectId: string,
  suiteId: string,
): Promise<ReportEndpoint[]> {
  return apiFetch<ReportEndpoint[]>(
    `/projects/${projectId}/test-suites/${suiteId}/explain`,
    { method: "POST" },
  );
}

export function downloadReport(
  projectId: string,
  suiteId: string,
  format: "csv" | "pdf",
): Promise<void> {
  return apiDownload(
    `/projects/${projectId}/test-suites/${suiteId}/report/export?format=${format}`,
    `report-${suiteId.slice(0, 8)}.${format}`,
  );
}

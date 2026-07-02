"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useProject } from "@/components/projects/project-context";
import { StatusDistribution } from "@/components/projects/StatusDistribution";
import { useToast } from "@/components/toast";
import { Badge, MethodBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { downloadReport, explainFailures, getReport } from "@/lib/reports";
import { getSuite, runSuite } from "@/lib/test-suites";
import { useApi } from "@/lib/useApi";
import type { SuiteReport, TestSuiteDetail } from "@/lib/types";

const POLL_MS = 3000;

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function StatCard({
  label,
  value,
  tone = "text-zinc-100",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </Card>
  );
}

export default function SuiteDetailPage() {
  const { project, canRun } = useProject();
  const { suiteId } = useParams<{ suiteId: string }>();
  const toast = useToast();

  const [suite, setSuite] = useState<TestSuiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Initial load.
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const s = await getSuite(project.id, suiteId);
        if (active) {
          setSuite(s);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Failed to load run");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [project.id, suiteId]);

  // Poll silently (no loading flicker) while a run is in progress.
  const status = suite?.status;
  useEffect(() => {
    if (status !== "running") return;
    let active = true;
    const iv = setInterval(async () => {
      try {
        const s = await getSuite(project.id, suiteId);
        if (active) setSuite(s);
      } catch {
        // Transient poll errors are ignored; the next tick retries.
      }
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [status, project.id, suiteId]);

  // Computed report: only meaningful once completed (backend 409s otherwise).
  // Keyed on status so it fetches when the run finishes.
  const {
    data: report,
    loading: reportLoading,
    reload: reloadReport,
  } = useApi<SuiteReport | null>(
    () =>
      status === "completed"
        ? getReport(project.id, suiteId)
        : Promise.resolve(null),
    [suiteId, status],
  );

  const [explaining, setExplaining] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function onRun() {
    setStarting(true);
    try {
      const s = await runSuite(project.id, suiteId);
      setSuite(s);
      toast.success("Run started.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to start run",
      );
    } finally {
      setStarting(false);
    }
  }

  async function onExplain() {
    setExplaining(true);
    try {
      const results = await explainFailures(project.id, suiteId);
      toast.success(
        `Generated ${results.length} failure explanation${results.length === 1 ? "" : "s"}.`,
      );
      reloadReport();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to explain failures",
      );
    } finally {
      setExplaining(false);
    }
  }

  async function onExport(format: "csv" | "pdf") {
    setExporting(true);
    try {
      await downloadReport(project.id, suiteId, format);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const backLink = `/projects/${project.id}/test-suites`;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-500" />
      </div>
    );
  }

  if (error || !suite) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-400">{error ?? "Run not found."}</p>
        <Link
          href={backLink}
          className="mt-3 inline-block text-sm font-medium text-emerald-500 hover:text-emerald-400"
        >
          ← Back to test runs
        </Link>
      </div>
    );
  }

  const runLabel = suite.name || `Run ${suite.id.slice(0, 8)}`;
  const canReRun = canRun && suite.status !== "running";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={backLink}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Test runs
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-zinc-50">{runLabel}</h2>
              <StatusBadge status={suite.status} />
            </div>
            <p className="mt-1 font-mono text-xs text-zinc-400">
              {suite.targetUrl}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {suite.status === "pending" && canRun && (
              <Button onClick={onRun} loading={starting}>
                Run tests
              </Button>
            )}
            {suite.status === "completed" && (
              <>
                {canRun && report && report.failures.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onExplain}
                    loading={explaining}
                  >
                    Explain failures
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onExport("csv")}
                  disabled={exporting}
                >
                  Export CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onExport("pdf")}
                  disabled={exporting}
                >
                  Export PDF
                </Button>
              </>
            )}
            {(suite.status === "completed" || suite.status === "failed") &&
              canReRun && (
                <Button variant="secondary" size="sm" onClick={onRun} loading={starting}>
                  Re-run
                </Button>
              )}
          </div>
        </div>

        {/* Config + timing chips */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="zinc">Time budget: {suite.timeBudget}s</Badge>
          <Badge tone="zinc">Mutation rate: {suite.mutationRate}</Badge>
          <Badge tone="zinc">Created: {formatDate(suite.createdAt)}</Badge>
          {suite.startedAt && (
            <Badge tone="zinc">Started: {formatDate(suite.startedAt)}</Badge>
          )}
          {suite.completedAt && (
            <Badge tone="zinc">Finished: {formatDate(suite.completedAt)}</Badge>
          )}
        </div>
      </div>

      {/* Status-specific body */}
      {suite.status === "pending" && (
        <Card className="p-10 text-center">
          <p className="text-sm text-zinc-400">
            {canRun
              ? "This run is configured but hasn't started. Click “Run tests” to begin."
              : "This run hasn't started yet."}
          </p>
        </Card>
      )}

      {suite.status === "running" && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Spinner className="h-6 w-6 text-emerald-500" />
          <p className="text-sm text-zinc-300">
            Running tests against the target API…
          </p>
          <p className="text-xs text-zinc-500">
            This page updates automatically.
          </p>
        </Card>
      )}

      {suite.status === "failed" && (
        <Card className="p-8 text-center">
          <p className="text-sm text-red-400">
            This run failed to complete. You can re-run it, or check that the
            target URL is reachable and the engine service is running.
          </p>
        </Card>
      )}

      {suite.status === "completed" &&
        (reportLoading && !report ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-emerald-500" />
          </div>
        ) : !report ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-zinc-400">
              Couldn&apos;t load the report for this run.
            </p>
          </Card>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Coverage"
                value={`${report.overview.coveragePct}%`}
                tone="text-emerald-400"
              />
              <StatCard
                label="Pass rate"
                value={`${report.overview.passRatePct}%`}
                tone="text-emerald-400"
              />
              <StatCard
                label="Endpoints"
                value={`${report.overview.coveredEndpoints}/${report.overview.totalEndpoints}`}
              />
              <StatCard
                label="Test cases"
                value={report.overview.totalTestCases}
              />
              <StatCard
                label="Passed"
                value={report.overview.passedTestCases}
                tone="text-emerald-400"
              />
              <StatCard
                label="Failed"
                value={report.overview.failedTestCases}
                tone="text-red-400"
              />
            </div>

            {/* Status-code distribution */}
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-zinc-200">
                Status-code distribution
              </h3>
              <StatusDistribution
                distribution={report.statusCodeDistribution}
              />
            </Card>

            {/* Per-endpoint results */}
            <Card className="overflow-hidden">
              <div className="border-b border-zinc-800 px-5 py-3">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Per-endpoint results
                </h3>
              </div>
              {report.endpoints.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-zinc-500">
                  No endpoints were exercised in this run.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-5 py-3 font-medium">Method</th>
                      <th className="px-5 py-3 font-medium">Path</th>
                      <th className="px-5 py-3 font-medium">Result</th>
                      <th className="px-5 py-3 font-medium">Status codes</th>
                      <th className="px-5 py-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.endpoints.map((e) => {
                      const codes = Object.entries(e.statusCodes);
                      return (
                        <tr
                          key={e.endpointId}
                          className="border-b border-zinc-800/60 last:border-0 align-top"
                        >
                          <td className="px-5 py-3">
                            <MethodBadge method={e.method} />
                          </td>
                          <td className="px-5 py-3 font-mono text-zinc-200">
                            {e.path}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-col gap-1">
                              <Badge tone={e.passed ? "emerald" : "red"}>
                                {e.passed ? "Passed" : "Failed"}
                              </Badge>
                              {e.hasServerErrors && (
                                <Badge tone="red">Server error</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            {codes.length === 0 ? (
                              <span className="text-zinc-500">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {codes.map(([code, n]) => (
                                  <span
                                    key={code}
                                    className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-300"
                                  >
                                    {code}×{n}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="max-w-sm px-5 py-3">
                            <span className="text-xs text-zinc-500">
                              {e.failureExplanation || "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        ))}
    </div>
  );
}

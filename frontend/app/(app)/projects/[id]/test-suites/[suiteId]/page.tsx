"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useProject } from "@/components/projects/project-context";
import { RunTimeline } from "@/components/projects/RunTimeline";
import { StatusDistribution } from "@/components/projects/StatusDistribution";
import { StatusDonut } from "@/components/projects/StatusDonut";
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

// Aggregate the raw HTTP status-code distribution into outcome classes. In
// black-box API testing there is no oracle for a generated request, so a
// non-2xx response is NOT automatically a "failure": a 4xx means the API
// correctly rejected a bad request, whereas a 5xx is an unhandled server
// error — the genuine fault signal.
function classifyOutcomes(distribution: Record<string, number>) {
  let successful = 0;
  let clientErrors = 0;
  let serverErrors = 0;
  let other = 0;
  for (const [code, n] of Object.entries(distribution)) {
    const count = Number(n) || 0;
    switch (code.charAt(0)) {
      case "2":
        successful += count;
        break;
      case "4":
        clientErrors += count;
        break;
      case "5":
        serverErrors += count;
        break;
      default:
        other += count; // 1xx / 3xx / non-numeric
    }
  }
  return { successful, clientErrors, serverErrors, other };
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

  // Outcome breakdown from the honest source (the status-code distribution).
  // "Faults" are 5xx server errors only — the real defects this tool exists to
  // surface — never 4xx client rejections.
  const outcomes = report
    ? classifyOutcomes(report.statusCodeDistribution)
    : null;
  const faults = outcomes?.serverErrors ?? 0;

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

      </div>

      {/* Run details — configuration + lifecycle timeline */}
      <Card className="grid gap-6 p-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">
            Configuration
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                Time budget
              </dt>
              <dd className="mt-0.5 text-zinc-200">{suite.timeBudget}s</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                Mutation rate
              </dt>
              <dd className="mt-0.5 text-zinc-200">{suite.mutationRate}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                Target URL
              </dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-zinc-300">
                {suite.targetUrl}
              </dd>
            </div>
          </dl>
        </div>
        <div className="sm:border-l sm:border-zinc-800 sm:pl-6">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">Timeline</h3>
          <RunTimeline
            status={suite.status}
            createdAt={suite.createdAt}
            startedAt={suite.startedAt}
            completedAt={suite.completedAt}
          />
        </div>
      </Card>

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
            {/* Faults detected — the headline signal. In black-box API
                testing, 5xx server errors are the genuine defects; 4xx are the
                API correctly rejecting bad requests, not failures. */}
            <div
              className={`flex items-center gap-4 rounded-xl border p-5 ${
                faults > 0
                  ? "border-red-500/40 bg-red-500/10"
                  : "border-emerald-500/30 bg-emerald-500/10"
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${
                  faults > 0
                    ? "bg-red-500/15 text-red-400"
                    : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                {faults > 0 ? "⚠" : "✓"}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-2xl font-semibold ${
                    faults > 0 ? "text-red-300" : "text-emerald-300"
                  }`}
                >
                  {faults > 0
                    ? `${faults} fault${faults === 1 ? "" : "s"} detected`
                    : "No faults detected"}
                </p>
                <p className="mt-0.5 text-sm text-zinc-400">
                  {faults > 0
                    ? "5xx server errors — unhandled conditions that likely indicate defects in the API."
                    : "No 5xx server errors were returned in this run."}
                </p>
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Coverage"
                value={`${report.overview.coveragePct}%`}
                tone="text-emerald-400"
              />
              <StatCard
                label="Endpoints"
                value={`${report.overview.coveredEndpoints}/${report.overview.totalEndpoints}`}
              />
              <StatCard
                label="Requests"
                value={report.overview.totalTestCases}
              />
              <StatCard
                label="Successful (2xx)"
                value={outcomes?.successful ?? 0}
                tone="text-emerald-400"
              />
              <StatCard
                label="Client errors (4xx)"
                value={outcomes?.clientErrors ?? 0}
                tone="text-amber-400"
              />
              <StatCard
                label="Server errors (5xx)"
                value={outcomes?.serverErrors ?? 0}
                tone={faults > 0 ? "text-red-400" : "text-zinc-100"}
              />
            </div>

            {/* Status-code distribution */}
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-zinc-200">
                Status-code distribution
              </h3>
              <StatusDonut distribution={report.statusCodeDistribution} />
              <div className="mt-6 border-t border-zinc-800 pt-5">
                <StatusDistribution
                  distribution={report.statusCodeDistribution}
                />
              </div>
            </Card>

            {/* Per-endpoint results */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Per-endpoint results
                </h3>
                <Link
                  href={`${backLink}/${suite.id}/requests/all`}
                  className="shrink-0 text-xs font-medium text-emerald-500 hover:text-emerald-400"
                >
                  View all captured requests →
                </Link>
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
                      <th className="px-5 py-3 font-medium">Requests</th>
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
                            {(() => {
                              const has5xx =
                                e.hasServerErrors ||
                                codes.some(([c]) => c.startsWith("5"));
                              const has2xx = codes.some(([c]) =>
                                c.startsWith("2"),
                              );
                              if (has5xx)
                                return <Badge tone="red">Server error</Badge>;
                              if (has2xx)
                                return <Badge tone="emerald">Successful</Badge>;
                              return <Badge tone="amber">Client error</Badge>;
                            })()}
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
                          <td className="px-5 py-3">
                            <Link
                              href={`${backLink}/${suite.id}/requests/${e.endpointId}`}
                              className="text-xs font-medium text-emerald-500 hover:text-emerald-400"
                            >
                              View →
                            </Link>
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

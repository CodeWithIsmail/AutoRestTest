"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DependencyGraphView } from "@/components/graph/DependencyGraphView";
import { EndpointFilterBar } from "@/components/projects/EndpointFilterBar";
import type { OutcomeFilter } from "@/components/projects/EndpointFilterBar";
import { useProject } from "@/components/projects/project-context";
import { RunHistoryPanel } from "@/components/projects/RunHistoryPanel";
import { RunTimeline } from "@/components/projects/RunTimeline";
import { StatusDistribution } from "@/components/projects/StatusDistribution";
import { StatusDonut } from "@/components/projects/StatusDonut";
import { useToast } from "@/components/toast";
import { Badge, MethodBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { errMsg } from "@/lib/api";
import {
  suiteGraphOptions,
  suiteOptions,
  suiteReportOptions,
} from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import { downloadReport, explainFailures } from "@/lib/reports";
import { replaySuite, runSuite } from "@/lib/test-suites";
import type { ReportEndpoint } from "@/lib/types";

function StatCard({
  label,
  value,
  tone = "text-zinc-900 dark:text-zinc-100",
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

/**
 * The outcome of a single endpoint, applying the same rule as
 * `classifyOutcomes` one level down: a 5xx is the genuine fault signal, a 4xx
 * is the API correctly rejecting a bad request.
 *
 * Single source of truth for both the Result badge and the outcome filter —
 * keeping them on one function is what stops the table from showing a row the
 * active filter says should be hidden.
 */
function endpointOutcome(e: ReportEndpoint): Exclude<OutcomeFilter, "all"> {
  const codes = Object.keys(e.statusCodes);
  if (e.hasServerErrors || codes.some((c) => c.startsWith("5"))) return "server";
  if (codes.some((c) => c.startsWith("2"))) return "successful";
  return "client";
}

const OUTCOME_BADGE: Record<
  Exclude<OutcomeFilter, "all">,
  { tone: "emerald" | "amber" | "red"; label: string }
> = {
  successful: { tone: "emerald", label: "Successful" },
  client: { tone: "amber", label: "Client error" },
  server: { tone: "red", label: "Server error" },
};

export default function SuiteDetailPage() {
  const { project, canRun } = useProject();
  const { suiteId } = useParams<{ suiteId: string }>();
  const router = useRouter();
  const toast = useToast();

  const queryClient = useQueryClient();

  // Load + poll in one: the query re-runs itself every 3s while the run is in
  // progress and stops the moment it isn't (see `suiteOptions`).
  const {
    data: suite,
    isPending: loading,
    error,
  } = useQuery(suiteOptions(project.id, suiteId));

  const status = suite?.status;

  // Computed report: only meaningful once completed (backend 409s otherwise).
  // `enabled` is what the old `Promise.resolve(null)` branch was standing in
  // for; it fetches on its own the moment the poll reports completion.
  const { data: report, isPending: reportLoading } = useQuery({
    ...suiteReportOptions(project.id, suiteId),
    enabled: status === "completed",
  });

  // The graph snapshotted for this run. Fetched separately from the report
  // because it is large and only this one section reads it.
  const { data: suiteGraph } = useQuery({
    ...suiteGraphOptions(project.id, suiteId),
    enabled: status === "completed",
  });

  // Per-endpoint table filters. Page-local (not in the URL) and deliberately
  // preserved across the report reload that "Explain failures" triggers.
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [code, setCode] = useState("");

  const endpoints = report?.endpoints;

  // Offer only the codes this run actually returned — an empty "404" option
  // would be a dead end.
  const codeOptions = useMemo(
    () =>
      Object.keys(report?.statusCodeDistribution ?? {}).sort(
        (a, b) => Number(a) - Number(b),
      ),
    [report?.statusCodeDistribution],
  );

  const visibleEndpoints = useMemo(() => {
    if (!endpoints) return [];
    const needle = query.trim().toLowerCase();
    return endpoints.filter((e) => {
      if (needle && !`${e.method} ${e.path}`.toLowerCase().includes(needle)) {
        return false;
      }
      if (outcome !== "all" && endpointOutcome(e) !== outcome) return false;
      if (code && !(e.statusCodes[code] > 0)) return false;
      return true;
    });
  }, [endpoints, query, outcome, code]);

  const filtersActive = query.trim() !== "" || outcome !== "all" || code !== "";

  function clearFilters() {
    setQuery("");
    setOutcome("all");
    setCode("");
  }

  const backLink = `/projects/${project.id}/test-suites`;

  const runMutation = useMutation({
    mutationFn: () => runSuite(project.id, suiteId),
    onSuccess: (started) => {
      // Writing the response in flips status to "running", which starts the
      // poll — no refetch needed to get there.
      queryClient.setQueryData(qk.suites.detail(project.id, suiteId), started);
      void queryClient.invalidateQueries({
        queryKey: qk.suites.list(project.id),
      });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      toast.success("Run started.");
    },
    onError: (err) => toast.error(errMsg(err, "Failed to start run")),
  });

  const replayMutation = useMutation({
    mutationFn: () => replaySuite(project.id, suiteId),
    onSuccess: (replay) => {
      toast.success("Replay started.");
      queryClient.setQueryData(
        qk.suites.detail(project.id, replay.id),
        replay,
      );
      void queryClient.invalidateQueries({
        queryKey: qk.suites.list(project.id),
      });
      // The origin run's history panel gains a row.
      void queryClient.invalidateQueries({
        queryKey: qk.suites.history(project.id, suiteId),
      });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      // A replay is a new, separate suite (unlike the old "Re-run", which
      // reused this suite's id) — navigate there to watch it run.
      router.push(`${backLink}/${replay.id}`);
    },
    onError: (err) => toast.error(errMsg(err, "Failed to start replay")),
  });

  const explainMutation = useMutation({
    mutationFn: () => explainFailures(project.id, suiteId),
    onSuccess: (results) => {
      toast.success(
        `Generated ${results.length} failure explanation${results.length === 1 ? "" : "s"}.`,
      );
      void queryClient.invalidateQueries({
        queryKey: qk.suites.report(project.id, suiteId),
      });
    },
    onError: (err) => toast.error(errMsg(err, "Failed to explain failures")),
  });

  // Not cached: this streams a file to the browser rather than returning data.
  const exportMutation = useMutation({
    mutationFn: (format: "csv" | "pdf") =>
      downloadReport(project.id, suiteId, format),
    onError: (err) => toast.error(errMsg(err, "Export failed")),
  });

  const onRun = () => runMutation.mutate();
  const onReplay = () => replayMutation.mutate();
  const onExplain = () => explainMutation.mutate();
  const onExport = (format: "csv" | "pdf") => exportMutation.mutate(format);

  const starting = runMutation.isPending;
  const replaying = replayMutation.isPending;
  const explaining = explainMutation.isPending;
  const exporting = exportMutation.isPending;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  if (error || !suite) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">
          {errMsg(error, "Run not found.")}
        </p>
        <Link
          href={backLink}
          className="mt-3 inline-block text-sm font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          ← Back to test runs
        </Link>
      </div>
    );
  }

  const isReplay = suite.runType === "replay";
  const runLabel =
    suite.name || (isReplay ? "Replay" : `Run ${suite.id.slice(0, 8)}`);
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
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← Test runs
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{runLabel}</h2>
              <StatusBadge status={suite.status} />
              {isReplay && <Badge tone="purple">Replay</Badge>}
            </div>
            <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
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
            {suite.status === "failed" && canReRun && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRun}
                loading={starting}
                title="This run never produced results — start it again with the AI engine."
              >
                Retry
              </Button>
            )}
            {suite.status === "completed" && canReRun && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onReplay}
                loading={replaying}
                title="Resend this run's exact captured requests, in order, as a new comparable run — no AI regeneration."
              >
                Replay
              </Button>
            )}
          </div>
        </div>

      </div>

      {/* Run details — configuration + lifecycle timeline */}
      <Card className="grid gap-6 p-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Configuration
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                Time budget
              </dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{suite.timeBudget}s</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                Mutation rate
              </dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{suite.mutationRate}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wider text-zinc-500">
                Target URL
              </dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {suite.targetUrl}
              </dd>
            </div>
            {isReplay && suite.originSuiteId && (
              <div className="col-span-2">
                <dt className="text-xs uppercase tracking-wider text-zinc-500">
                  Replayed from
                </dt>
                <dd className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                  <Link
                    href={`${backLink}/${suite.originSuiteId}`}
                    className="font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    View the original run →
                  </Link>{" "}
                  This resent that run&apos;s exact captured requests, in
                  order — no AI generation occurred.
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="sm:border-l sm:border-zinc-200 dark:sm:border-zinc-800 sm:pl-6">
          <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Timeline</h3>
          <RunTimeline
            status={suite.status}
            createdAt={suite.createdAt}
            startedAt={suite.startedAt}
            completedAt={suite.completedAt}
          />
        </div>
      </Card>

      <RunHistoryPanel
        projectId={project.id}
        suiteId={suite.id}
        currentSuiteId={suite.id}
        basePath={backLink}
      />

      {/* Status-specific body */}
      {suite.status === "pending" && (
        <Card className="p-10 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {canRun
              ? "This run is configured but hasn't started. Click “Run tests” to begin."
              : "This run hasn't started yet."}
          </p>
        </Card>
      )}

      {suite.status === "running" && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Running tests against the target API…
          </p>
          <p className="text-xs text-zinc-500">
            This page updates automatically.
          </p>
        </Card>
      )}

      {suite.status === "failed" && (
        <Card className="p-8 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            This run failed to complete. You can retry it, or check that the
            target URL is reachable and the engine service is running.
          </p>
        </Card>
      )}

      {suite.status === "completed" &&
        (reportLoading && !report ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
          </div>
        ) : !report ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {faults > 0 ? "⚠" : "✓"}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-2xl font-semibold ${
                    faults > 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {faults > 0
                    ? `${faults} fault${faults === 1 ? "" : "s"} detected`
                    : "No faults detected"}
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
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
                tone="text-emerald-600 dark:text-emerald-400"
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
                tone="text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                label="Client errors (4xx)"
                value={outcomes?.clientErrors ?? 0}
                tone="text-amber-600 dark:text-amber-400"
              />
              <StatCard
                label="Server errors (5xx)"
                value={outcomes?.serverErrors ?? 0}
                tone={faults > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"}
              />
            </div>

            {/* Status-code distribution */}
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Status-code distribution
              </h3>
              <StatusDonut distribution={report.statusCodeDistribution} />
              <div className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-5">
                <StatusDistribution
                  distribution={report.statusCodeDistribution}
                />
              </div>
            </Card>

            {/* Per-endpoint results */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Per-endpoint results
                </h3>
                <Link
                  href={`${backLink}/${suite.id}/requests/all`}
                  className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  View all captured requests →
                </Link>
              </div>
              {report.endpoints.length > 0 && (
                <EndpointFilterBar
                  query={query}
                  onQuery={setQuery}
                  outcome={outcome}
                  onOutcome={setOutcome}
                  code={code}
                  onCode={setCode}
                  codes={codeOptions}
                  shown={visibleEndpoints.length}
                  total={report.endpoints.length}
                  active={filtersActive}
                />
              )}
              {report.endpoints.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-zinc-500">
                  No endpoints were exercised in this run.
                </p>
              ) : visibleEndpoints.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    No endpoints match these filters.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-5 py-3 font-medium">Method</th>
                      <th className="px-5 py-3 font-medium">Path</th>
                      <th className="px-5 py-3 font-medium">Result</th>
                      <th className="px-5 py-3 font-medium">Status codes</th>
                      <th className="px-5 py-3 font-medium">Notes</th>
                      <th className="px-5 py-3 font-medium">Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEndpoints.map((e) => {
                      const codes = Object.entries(e.statusCodes);
                      const badge = OUTCOME_BADGE[endpointOutcome(e)];
                      return (
                        <tr
                          key={e.endpointId}
                          className="border-b border-zinc-200 dark:border-zinc-800/60 last:border-0 align-top"
                        >
                          <td className="px-5 py-3">
                            <MethodBadge method={e.method} />
                          </td>
                          <td className="px-5 py-3 font-mono text-zinc-800 dark:text-zinc-200">
                            {e.path}
                          </td>
                          <td className="px-5 py-3">
                            <Badge tone={badge.tone}>{badge.label}</Badge>
                          </td>
                          <td className="px-5 py-3">
                            {codes.length === 0 ? (
                              <span className="text-zinc-500">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {codes.map(([code, n]) => (
                                  <span
                                    key={code}
                                    className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:text-zinc-300"
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
                              className="text-xs font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
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

            {suiteGraph && suiteGraph.nodes.length > 0 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Dependency graph
                  </h3>
                  <p className="mt-1 max-w-3xl text-xs text-zinc-500">
                    Which operations the engine believed depend on each other,
                    and which of those the reinforcement-learning agent actually
                    used during this run.
                  </p>
                </div>
                <DependencyGraphView
                  graph={suiteGraph}
                  requestsHref={(operationId) => {
                    // The graph is keyed by operationId; the requests view is
                    // keyed by our Endpoint row, so match on method + path.
                    const node = suiteGraph.nodes.find(
                      (n) => n.id === operationId,
                    );
                    const match = report.endpoints.find(
                      (e) => e.method === node?.method && e.path === node?.path,
                    );
                    return match
                      ? `${backLink}/${suite.id}/requests/${match.endpointId}`
                      : null;
                  }}
                />
              </div>
            )}
          </>
        ))}
    </div>
  );
}

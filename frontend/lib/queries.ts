// One `queryOptions()` factory per read, in one place.
//
// Why factories rather than inline `useQuery({ queryKey, queryFn })` calls:
// a key and its fetcher have to agree, and three different things need that
// pair — the component that reads, the hover handler that prefetches, and the
// mutation that writes into the cache. Defining it once is what stops a
// prefetch from populating a key nothing reads.
//
// Every factory forwards the `signal` TanStack supplies, so leaving a screen
// actually cancels its in-flight reads.

import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "./api";
import {
  listInvitations,
  listMembers,
  listMyInvitations,
} from "./collaboration";
import { listEndpoints } from "./endpoints";
import { getProjectGraph, getSuiteGraph } from "./graph";
import { listLlmSettings } from "./llm-settings";
import { getProject, listProjects } from "./projects";
import { qk } from "./query-keys";
import { getReport } from "./reports";
import {
  getRequestLog,
  getRequestLogSummary,
  listRequestLogs,
} from "./request-logs";
import { getGeneration } from "./spec-generation";
import { getSpec } from "./specs";
import { getRunHistory, getSuite, listSuites } from "./test-suites";
import type { User } from "./types";

/**
 * How often a job in flight is re-checked. Unchanged from the hand-rolled
 * intervals these replaced — 3s for runs and graph builds, 5s for generation,
 * which is measured in tens of minutes and does not deserve a 3s poll.
 *
 * TanStack pauses these while the tab is hidden and catches up on focus, which
 * the old `setInterval` loops did not.
 */
const RUN_POLL_MS = 3000;
const GENERATION_POLL_MS = 5000;

// --- session ----------------------------------------------------------------

export const meOptions = () =>
  queryOptions({
    queryKey: qk.me,
    queryFn: ({ signal }) => apiFetch<User>("/auth/me", { signal }),
    // Always revalidated on mount: it is the one query whose staleness means
    // "this session may no longer exist". A persisted copy still paints the
    // shell instantly; a revoked token then trips the global 401 handler.
    staleTime: 0,
    retry: false,
  });

// --- admin --------------------------------------------------------------

export const llmSettingsOptions = () =>
  queryOptions({
    queryKey: qk.llmSettings,
    queryFn: ({ signal }) => listLlmSettings(signal),
  });

// --- projects ---------------------------------------------------------------

export const projectsOptions = () =>
  queryOptions({
    queryKey: qk.projects.list(),
    queryFn: ({ signal }) => listProjects(signal),
  });

export const projectOptions = (projectId: string) =>
  queryOptions({
    queryKey: qk.projects.detail(projectId),
    queryFn: ({ signal }) => getProject(projectId, signal),
  });

export const specOptions = (projectId: string) =>
  queryOptions({
    queryKey: qk.projects.spec(projectId),
    queryFn: ({ signal }) => getSpec(projectId, signal),
  });

export const endpointsOptions = (projectId: string) =>
  queryOptions({
    queryKey: qk.projects.endpoints(projectId),
    queryFn: ({ signal }) => listEndpoints(projectId, signal),
  });

export const membersOptions = (projectId: string) =>
  queryOptions({
    queryKey: qk.projects.members(projectId),
    queryFn: ({ signal }) => listMembers(projectId, signal),
  });

export const projectInvitationsOptions = (projectId: string) =>
  queryOptions({
    queryKey: qk.projects.invitations(projectId),
    queryFn: ({ signal }) => listInvitations(projectId, signal),
  });

export const myInvitationsOptions = () =>
  queryOptions({
    queryKey: qk.myInvitations,
    queryFn: ({ signal }) => listMyInvitations(signal),
  });

// --- spec generation (polled) -----------------------------------------------

export const generationOptions = (projectId: string) =>
  queryOptions({
    queryKey: qk.projects.generation(projectId),
    queryFn: ({ signal }) => getGeneration(projectId, signal),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? GENERATION_POLL_MS : false,
  });

// --- dependency graph (polled) ----------------------------------------------

export const projectGraphOptions = (projectId: string) =>
  queryOptions({
    queryKey: qk.projects.graph(projectId),
    queryFn: ({ signal }) => getProjectGraph(projectId, signal),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? RUN_POLL_MS : false,
  });

// --- test suites ------------------------------------------------------------

export const suitesOptions = (projectId: string) =>
  queryOptions({
    queryKey: qk.suites.list(projectId),
    queryFn: ({ signal }) => listSuites(projectId, signal),
  });

export const suiteOptions = (projectId: string, suiteId: string) =>
  queryOptions({
    queryKey: qk.suites.detail(projectId, suiteId),
    queryFn: ({ signal }) => getSuite(projectId, suiteId, signal),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? RUN_POLL_MS : false,
  });

export const suiteHistoryOptions = (projectId: string, suiteId: string) =>
  queryOptions({
    queryKey: qk.suites.history(projectId, suiteId),
    queryFn: ({ signal }) => getRunHistory(projectId, suiteId, signal),
  });

export const suiteReportOptions = (projectId: string, suiteId: string) =>
  queryOptions({
    queryKey: qk.suites.report(projectId, suiteId),
    queryFn: ({ signal }) => getReport(projectId, suiteId, signal),
  });

export const suiteGraphOptions = (projectId: string, suiteId: string) =>
  queryOptions({
    queryKey: qk.suites.graph(projectId, suiteId),
    queryFn: ({ signal }) =>
      getSuiteGraph(projectId, suiteId, signal).then((r) => r.graph),
  });

// --- captured requests ------------------------------------------------------

export const requestLogSummaryOptions = (projectId: string, suiteId: string) =>
  queryOptions({
    queryKey: qk.suites.logSummary(projectId, suiteId),
    queryFn: ({ signal }) => getRequestLogSummary(projectId, suiteId, signal),
  });

export const requestLogsOptions = (
  projectId: string,
  suiteId: string,
  filters: {
    endpointId?: string;
    status?: string;
    page: number;
    pageSize: number;
  },
) =>
  queryOptions({
    queryKey: qk.suites.logs(projectId, suiteId, filters),
    queryFn: ({ signal }) =>
      listRequestLogs(projectId, suiteId, filters, signal),
  });

export const requestLogOptions = (
  projectId: string,
  suiteId: string,
  logId: string,
) =>
  queryOptions({
    queryKey: qk.suites.log(projectId, suiteId, logId),
    queryFn: ({ signal }) => getRequestLog(projectId, suiteId, logId, signal),
  });

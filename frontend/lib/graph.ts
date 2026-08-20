// Typed wrappers around the dependency-graph endpoints.

import { apiFetch } from "./api";
import type { DependencyGraph, GraphState } from "./types";

/** The project's spec-derived graph, plus the state of any build in flight. */
export function getProjectGraph(
  projectId: string,
  signal?: AbortSignal,
): Promise<GraphState> {
  return apiFetch<GraphState>(`/projects/${projectId}/graph`, { signal });
}

/** Queue a build from the project's current spec. Returns immediately. */
export function buildProjectGraph(projectId: string): Promise<GraphState> {
  return apiFetch<GraphState>(`/projects/${projectId}/graph`, {
    method: "POST",
  });
}

/** The graph snapshotted for one run, carrying the agent's learned weights. */
export function getSuiteGraph(
  projectId: string,
  suiteId: string,
  signal?: AbortSignal,
): Promise<{ graph: DependencyGraph | null }> {
  return apiFetch<{ graph: DependencyGraph | null }>(
    `/projects/${projectId}/test-suites/${suiteId}/graph`,
    { signal },
  );
}

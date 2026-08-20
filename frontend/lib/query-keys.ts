// Query keys for TanStack Query, in one place.
//
// Keys are hierarchical so a mutation can invalidate exactly as much as it
// needs to. TanStack matches by prefix, so `['projects']` matches every key
// below it — that is why the list and the details sit in separate branches
// (`…, 'list'` vs `…, 'detail', id`). Without that split there would be no way
// to refresh the projects list without also throwing away every loaded
// project's spec, endpoints and runs.
//
// Everything project-scoped hangs off `projects.detail(id)`, so deleting a
// project can drop the whole subtree with a single call.

export const qk = {
  /** The signed-in user (GET /auth/me). */
  me: ["me"] as const,

  /** Invitations addressed to the current user, across all projects. */
  myInvitations: ["my-invitations"] as const,

  projects: {
    /** Root of the whole projects branch. Invalidate to refresh everything. */
    all: ["projects"] as const,
    /** The list only — badges, member counts, last-run summaries. */
    list: () => [...qk.projects.all, "list"] as const,
    /** Root of the per-project branch. */
    details: () => [...qk.projects.all, "detail"] as const,
    /** One project, and the prefix for all of its sub-resources below. */
    detail: (projectId: string) =>
      [...qk.projects.details(), projectId] as const,

    spec: (projectId: string) =>
      [...qk.projects.detail(projectId), "spec"] as const,
    generation: (projectId: string) =>
      [...qk.projects.detail(projectId), "generation"] as const,
    endpoints: (projectId: string) =>
      [...qk.projects.detail(projectId), "endpoints"] as const,
    graph: (projectId: string) =>
      [...qk.projects.detail(projectId), "graph"] as const,
    members: (projectId: string) =>
      [...qk.projects.detail(projectId), "members"] as const,
    /** Invitations *into* this project, as seen by an owner/admin. */
    invitations: (projectId: string) =>
      [...qk.projects.detail(projectId), "invitations"] as const,
  },

  suites: {
    /** Root of one project's runs. */
    all: (projectId: string) =>
      [...qk.projects.detail(projectId), "suites"] as const,
    list: (projectId: string) => [...qk.suites.all(projectId), "list"] as const,
    details: (projectId: string) =>
      [...qk.suites.all(projectId), "detail"] as const,
    /** One run, and the prefix for its report/graph/logs below. */
    detail: (projectId: string, suiteId: string) =>
      [...qk.suites.details(projectId), suiteId] as const,

    report: (projectId: string, suiteId: string) =>
      [...qk.suites.detail(projectId, suiteId), "report"] as const,
    graph: (projectId: string, suiteId: string) =>
      [...qk.suites.detail(projectId, suiteId), "graph"] as const,
    history: (projectId: string, suiteId: string) =>
      [...qk.suites.detail(projectId, suiteId), "history"] as const,
    logSummary: (projectId: string, suiteId: string) =>
      [...qk.suites.detail(projectId, suiteId), "log-summary"] as const,

    /**
     * One page of captured requests. The filters go in the key, so paging and
     * filtering are independently cached and stepping back to a page you have
     * already seen is free.
     */
    logs: (
      projectId: string,
      suiteId: string,
      filters: {
        endpointId?: string;
        status?: string;
        page: number;
        pageSize: number;
      },
    ) => [...qk.suites.detail(projectId, suiteId), "logs", filters] as const,

    /** A single captured request, loaded lazily when its row is expanded. */
    log: (projectId: string, suiteId: string, logId: string) =>
      [...qk.suites.detail(projectId, suiteId), "log", logId] as const,
  },
} as const;

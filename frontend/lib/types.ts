// Shared TypeScript types mirroring the NestJS backend response shapes.
// Kept in one place so every screen consumes the same contract.

export type Role = "admin" | "tester" | "viewer";

/** The public user profile returned by the backend (never includes a password). */
export interface User {
  id: string;
  username: string;
  email: string;
}

/** Response of POST /auth/login. */
export interface AuthResponse {
  accessToken: string;
  user: User;
}

/** Response of POST /auth/register (no token — the client logs in afterwards). */
export interface RegisterResponse {
  message: string;
  user: User;
}

// --- projects ---------------------------------------------------------------

/** A project as returned in the list (GET /projects). */
export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  /** The current user's role in this project. */
  role: Role;
}

/** A member row inside a project detail. */
export interface ProjectMember {
  userId: string;
  username: string;
  email: string;
  role: Role;
  joinedAt: string;
}

/** Full project detail (GET /projects/:id). */
export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: User;
  members: ProjectMember[];
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
}

// --- API spec + endpoints ---------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Full spec view (GET /projects/:id/spec). */
export interface SpecDetail {
  id: string;
  fileName: string;
  generatedByAI: boolean;
  uploadedAt: string;
  openapiVersion: string;
  title: string;
  endpointCount: number;
  fileContent: string;
}

export type SpecGenStatus = "pending" | "running" | "completed" | "failed";

/**
 * A codebase-to-OpenAPI generation job
 * (GET /projects/:id/spec/generate). `generatedSpec` is populated once the job
 * completes and holds the document awaiting the user's review.
 */
export interface SpecGeneration {
  id: string;
  status: SpecGenStatus;
  sourceName: string;
  /** Human-readable current pipeline step, e.g. "Finding API entry points". */
  step: string | null;
  stepIndex: number;
  stepTotal: number;
  generatedSpec: string | null;
  operationCount: number;
  warnings: string[];
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** A single endpoint (GET /projects/:id/endpoints). */
export interface EndpointItem {
  id: string;
  method: HttpMethod;
  path: string;
  description: string | null;
  addedManually: boolean;
  createdAt: string;
}

export interface CreateEndpointInput {
  method: HttpMethod;
  path: string;
  description?: string;
}

// --- test suites + execution ------------------------------------------------

export type SuiteStatus = "pending" | "running" | "completed" | "failed";

export interface TestSuiteSummary {
  id: string;
  name: string | null;
  status: SuiteStatus;
  targetUrl: string;
  timeBudget: number;
  mutationRate: number;
  totalEndpoints: number;
  coveredEndpoints: number;
  totalTestCases: number;
  passedTestCases: number;
  failedTestCases: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TestSuiteDetail extends TestSuiteSummary {
  jobId: string | null;
  triggeredById: string;
}

export interface TestCaseItem {
  id: string;
  endpointId: string;
  method: HttpMethod;
  path: string;
  statusCode: number | null;
  passed: boolean;
  responseBody: unknown;
  failureExplanation: string | null;
  createdAt: string;
}

export interface CreateTestSuiteInput {
  name?: string;
  targetUrl: string;
  timeBudget: number;
  mutationRate?: number;
}

// --- captured requests (recording proxy) ------------------------------------

/** Per-endpoint rollup of captured requests for a run. */
export interface RequestLogEndpointSummary {
  endpointId: string | null;
  method: string | null;
  path: string | null;
  total: number;
  passed: number;
  failed: number;
  statusClasses: Record<string, number>;
  /** Exact code tallies, e.g. `{ "200": 8, "404": 5 }`. Requests that never
   *  got a response (null status) are counted in `total` but not here. */
  statusCodes: Record<string, number>;
}

/** Lightweight row in the paginated captured-request list. */
export interface RequestLogListItem {
  id: string;
  seq: number;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
}

export interface RequestLogPage {
  items: RequestLogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Full captured request/response for the expandable detail row. */
export interface RequestLogDetail {
  id: string;
  seq: number;
  endpointId: string | null;
  method: string;
  path: string;
  url: string;
  statusCode: number | null;
  durationMs: number | null;
  requestHeaders: Record<string, string> | null;
  requestBody: string | null;
  requestTruncated: boolean;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  responseTruncated: boolean;
  createdAt: string;
}

// --- reports ----------------------------------------------------------------

export interface ReportEndpoint {
  endpointId: string;
  method: HttpMethod;
  path: string;
  passed: boolean;
  statusCodes: Record<string, number>;
  hasServerErrors: boolean;
  failureExplanation: string | null;
}

export interface SuiteReport {
  overview: {
    suiteId: string;
    name: string | null;
    status: SuiteStatus;
    targetUrl: string;
    startedAt: string | null;
    completedAt: string | null;
    durationSeconds: number | null;
    totalEndpoints: number;
    coveredEndpoints: number;
    coveragePct: number;
    totalTestCases: number;
    passedTestCases: number;
    failedTestCases: number;
    passRatePct: number;
  };
  statusCodeDistribution: Record<string, number>;
  endpoints: ReportEndpoint[];
  failures: ReportEndpoint[];
}

// --- collaboration ----------------------------------------------------------

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired";

export interface MemberItem {
  userId: string;
  username: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface MemberList {
  owner: { userId: string; username: string; email: string };
  members: MemberItem[];
}

/** An invitation as seen by a project owner/admin. */
export interface InvitationItem {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  token: string;
  acceptUrl: string;
  expiresAt: string;
  createdAt: string;
}

/** An invitation as seen by the invitee. */
export interface MyInvitationItem {
  id: string;
  projectId: string;
  projectName: string;
  role: Role;
  token: string;
  acceptUrl: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreateInvitationInput {
  email: string;
  role: Role;
}

// --- dependency graph -------------------------------------------------------

/**
 * How much the engine knows about one dependency.
 *  - `predicted`  the semantic pass proposed it; the RL agent never acted on it
 *  - `confirmed`  the agent used it and was rewarded (positive Q)
 *  - `penalized`  the agent used it and was punished (negative Q)
 *  - `discovered` the agent found it at run time; the spec never implied it
 */
export type GraphEdgeKind =
  | "predicted"
  | "confirmed"
  | "penalized"
  | "discovered";

export type GraphBuildStatus = "pending" | "running" | "ready" | "failed";

/** One parameter the consumer needs and the producer field that supplies it. */
export interface GraphMatch {
  param: string;
  paramIn: string;
  producedBy: string;
  producedIn: string;
  /** Cosine similarity; null on an edge only the RL agent found. */
  similarity: number | null;
  /** Learned Q-value; null when the agent never exercised this match. */
  q: number | null;
}

export interface GraphNode {
  id: string;
  method: HttpMethod | null;
  path: string | null;
  summary: string | null;
  parameters: string[];
  hasRequestBody: boolean;
  /** Run mode only; absent means the operation was never called. */
  statusCodes?: Record<string, number>;
  totalRequests?: number;
  hasServerErrors?: boolean;
}

/**
 * Edges point the way the data flows: `from` produces the value, `to` consumes
 * it. The backend flips the engine's own (consumer -> producer) direction once,
 * so top-to-bottom reads as execution order.
 */
export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  maxSimilarity: number | null;
  maxQ: number | null;
  tentative: boolean;
  matches: GraphMatch[];
}

export interface GraphStats {
  operations: number;
  dependencies: number;
  confirmed: number;
  predicted: number;
  penalized: number;
  discovered: number;
  isolated: number;
  entryPoints: string[];
  mostDependedUpon: { id: string; count: number } | null;
}

export interface DependencyGraph {
  /** "spec" = built from the specification alone; "run" = with learned weights. */
  source: "spec" | "run";
  generatedAt: string;
  /** True when the edge cap was hit and the weakest edges were dropped. */
  truncated: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

/** GET /projects/:id/graph — the graph plus the state of any build. */
export interface GraphState {
  status: GraphBuildStatus;
  graph: DependencyGraph | null;
  error: string | null;
  completedAt: string | null;
}

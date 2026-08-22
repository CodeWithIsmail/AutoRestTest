// Shared TypeScript types mirroring the NestJS backend response shapes.
// Kept in one place so every screen consumes the same contract.

export type Role = "admin" | "tester" | "viewer";

/** Accent colours offered for the generated initial avatar. */
export const AVATAR_COLORS = [
  "emerald",
  "blue",
  "purple",
  "amber",
  "rose",
  "cyan",
  "zinc",
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** The public user profile returned by the backend (never includes a password). */
export interface User {
  id: string;
  username: string;
  email: string;
  /** Display name. Null means "fall back to the username". */
  name: string | null;
  avatarColor: string | null;
  /**
   * Always true: an account cannot be created until its address has been
   * proven, so there is no unverified user to guard against anywhere in the UI.
   */
  emailVerified: boolean;
  notifyRunFinished: boolean;
  notifyInvitations: boolean;
  createdAt: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatarColor?: string;
}

export interface UpdateNotificationsInput {
  notifyRunFinished?: boolean;
  notifyInvitations?: boolean;
}

/** Response of POST /auth/login. */
export interface AuthResponse {
  accessToken: string;
  user: User;
}

/**
 * Response of POST /auth/register.
 *
 * No token and no user: registration only parks a pending signup, so there is
 * no account to be signed in to until the emailed code comes back. When
 * `verificationRequired` is false the server has the check switched off and
 * created the account outright — the client should send the user to sign in.
 */
export interface RegisterResponse {
  message: string;
  verificationRequired: boolean;
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
  /** Whether the project has no spec, an uploaded one, or an AI-generated one. */
  specStatus: "none" | "uploaded" | "generated";
  /** Set only while a spec-generation job is in-flight or awaiting review. */
  generationStatus: SpecGenStatus | null;
  /** The most recent test run, or null if none has ever been triggered. */
  lastRun: {
    status: SuiteStatus;
    createdAt: string;
    completedAt: string | null;
  } | null;
  /** Latest known activity: max of last edit, spec upload, and last run. */
  lastActivityAt: string;
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

/**
 * "generated" suites are AI/MARL-driven runs against the current spec.
 * "replay" suites resend a fixed, previously-captured request sequence from
 * their origin suite — no AI engine involved, useful for regression checks.
 */
export type TestRunType = "generated" | "replay";

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
  runType: TestRunType;
  /** Set only on a "replay" suite: the id of the original AI-generated run. */
  originSuiteId: string | null;
}

export interface TestSuiteDetail extends TestSuiteSummary {
  jobId: string | null;
  triggeredById: string;
  /** Extra HTTP headers sent with every request to the target API. */
  customHeaders: Record<string, string> | null;
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
  /**
   * Extra HTTP headers sent with every request to the target API (e.g.
   * Authorization for Basic/Bearer/API-key auth). Write-only: never echoed
   * back in TestSuiteSummary/TestSuiteDetail.
   */
  customHeaders?: Record<string, string>;
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

/**
 * Result of live-sending one captured request via `runRequestLog`. Ephemeral —
 * unlike a replay, nothing here is persisted; it only reflects what came back
 * just now.
 */
export interface RunRequestLogResult {
  method: string;
  url: string;
  statusCode: number | null;
  durationMs: number;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  responseTruncated: boolean;
  /** Set instead of a response when the send itself failed (network error, timeout). */
  error: string | null;
  ranAt: string;
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

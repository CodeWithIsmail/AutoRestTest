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

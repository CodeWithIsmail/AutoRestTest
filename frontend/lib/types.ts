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

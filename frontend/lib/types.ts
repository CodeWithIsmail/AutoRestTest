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

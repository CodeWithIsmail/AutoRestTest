// Typed wrappers around the /auth endpoints that the auth provider does not
// own: email verification and password recovery.
//
// Login, register and the /auth/me bootstrap live in components/auth-provider
// because they mutate the cached session; these four do not.

import { apiFetch } from "./api";
import type { AuthResponse } from "./types";

/**
 * Always resolves with the same message whether or not the address is
 * registered — the backend deliberately refuses to confirm which, so the UI
 * must not imply otherwise.
 */
export function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

/** Consumes the one-time token from the emailed link. Ends every session. */
export function resetPassword(
  token: string,
  password: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, password },
  });
}

/**
 * Finishes registration: the account is created here, not at /auth/register,
 * and the response is a full session. Public — there is no token to send yet,
 * so the address identifies the pending signup.
 */
export function verifySignup(
  email: string,
  code: string,
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/verify-signup", {
    method: "POST",
    auth: false,
    body: { email, code },
  });
}

/** Reissues the signup code. Always resolves, pending signup or not. */
export function resendSignupCode(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/signup/resend", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

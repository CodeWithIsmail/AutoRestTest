// Typed wrappers around the /users/me backend endpoints (profile, password,
// notification preferences, account deletion).
//
// Reads are not here: the current user comes from GET /auth/me via the auth
// provider, which is already the single source of truth for "who am I".

import { apiFetch } from "./api";
import type {
  UpdateNotificationsInput,
  UpdateProfileInput,
  User,
} from "./types";

export function updateProfile(input: UpdateProfileInput): Promise<User> {
  return apiFetch<User>("/users/me", { method: "PATCH", body: input });
}

export function updateNotifications(
  input: UpdateNotificationsInput,
): Promise<User> {
  return apiFetch<User>("/users/me/notifications", {
    method: "PATCH",
    body: input,
  });
}

/**
 * Succeeds only with the correct current password. Note the backend invalidates
 * every existing token on success, this one included — the caller must sign the
 * user out rather than carry on with a token that is now dead.
 */
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/users/me/password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}

/** Irreversible. Takes every project the user owns with it. */
export function deleteAccount(password: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/users/me", {
    method: "DELETE",
    body: { password },
  });
}

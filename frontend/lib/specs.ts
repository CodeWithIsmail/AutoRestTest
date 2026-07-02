// Typed wrappers around the /projects/:id/spec endpoints.

import { ApiError, apiFetch } from "./api";
import type { SpecDetail } from "./types";

/**
 * Returns the project's spec, or `null` if none has been uploaded (the backend
 * responds 404), so callers can render an empty state instead of an error.
 */
export async function getSpec(projectId: string): Promise<SpecDetail | null> {
  try {
    return await apiFetch<SpecDetail>(`/projects/${projectId}/spec`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function uploadSpec(
  projectId: string,
  file: File,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/projects/${projectId}/spec`, {
    method: "POST",
    body: form,
  });
}

export function deleteSpec(projectId: string): Promise<{ message: string }> {
  return apiFetch(`/projects/${projectId}/spec`, { method: "DELETE" });
}

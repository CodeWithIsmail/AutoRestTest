// Typed wrappers around the /projects/:id/spec/generate endpoints — generating
// an OpenAPI spec from an uploaded source archive.

import { ApiError, apiFetch } from "./api";
import type { SpecDetail, SpecGeneration } from "./types";

export interface GenerateOptions {
  title?: string;
  version?: string;
  /** Comma-separated directory names to exclude from the analysis. */
  ignorePath?: string;
}

/** Queue a generation from a .zip of the API's source code. */
export function startGeneration(
  projectId: string,
  file: File,
  opts: GenerateOptions = {},
): Promise<SpecGeneration> {
  const form = new FormData();
  form.append("file", file);
  if (opts.title) form.append("title", opts.title);
  if (opts.version) form.append("version", opts.version);
  if (opts.ignorePath) form.append("ignorePath", opts.ignorePath);
  return apiFetch(`/projects/${projectId}/spec/generate`, {
    method: "POST",
    body: form,
  });
}

/**
 * Returns the project's current generation job, or `null` when there is none
 * (the backend responds 404), matching `getSpec`'s empty-state contract.
 */
export async function getGeneration(
  projectId: string,
): Promise<SpecGeneration | null> {
  try {
    return await apiFetch<SpecGeneration>(
      `/projects/${projectId}/spec/generate`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Promote the reviewed document to the project's API specification. */
export function applyGeneration(projectId: string): Promise<SpecDetail> {
  return apiFetch(`/projects/${projectId}/spec/generate/apply`, {
    method: "POST",
  });
}

/** Discard the generation, leaving any existing spec untouched. */
export function discardGeneration(
  projectId: string,
): Promise<{ message: string }> {
  return apiFetch(`/projects/${projectId}/spec/generate`, { method: "DELETE" });
}

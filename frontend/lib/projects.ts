// Typed wrappers around the /projects backend endpoints.

import { apiFetch } from "./api";
import type {
  CreateProjectInput,
  ProjectDetail,
  ProjectListItem,
  UpdateProjectInput,
} from "./types";

export function listProjects(signal?: AbortSignal): Promise<ProjectListItem[]> {
  return apiFetch<ProjectListItem[]>("/projects", { signal });
}

export function getProject(
  id: string,
  signal?: AbortSignal,
): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/projects/${id}`, { signal });
}

export function createProject(
  input: CreateProjectInput,
): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>("/projects", {
    method: "POST",
    body: input,
  });
}

export function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/projects/${id}`, {
    method: "PATCH",
    body: input,
  });
}

/** Irreversible. Requires the owner's password to confirm. */
export function deleteProject(
  id: string,
  password: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/projects/${id}`, {
    method: "DELETE",
    body: { password },
  });
}

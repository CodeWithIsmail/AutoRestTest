// Typed wrappers around the /projects backend endpoints.

import { apiFetch } from "./api";
import type {
  CreateProjectInput,
  ProjectDetail,
  ProjectListItem,
  UpdateProjectInput,
} from "./types";

export function listProjects(): Promise<ProjectListItem[]> {
  return apiFetch<ProjectListItem[]>("/projects");
}

export function getProject(id: string): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/projects/${id}`);
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

export function deleteProject(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/projects/${id}`, {
    method: "DELETE",
  });
}

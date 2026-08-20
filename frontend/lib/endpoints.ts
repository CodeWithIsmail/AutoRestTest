// Typed wrappers around the /projects/:id/endpoints endpoints.

import { apiFetch } from "./api";
import type { CreateEndpointInput, EndpointItem } from "./types";

export function listEndpoints(
  projectId: string,
  signal?: AbortSignal,
): Promise<EndpointItem[]> {
  return apiFetch<EndpointItem[]>(`/projects/${projectId}/endpoints`, {
    signal,
  });
}

export function createEndpoint(
  projectId: string,
  input: CreateEndpointInput,
): Promise<EndpointItem> {
  return apiFetch<EndpointItem>(`/projects/${projectId}/endpoints`, {
    method: "POST",
    body: input,
  });
}

export function deleteEndpoint(
  projectId: string,
  endpointId: string,
): Promise<{ message: string }> {
  return apiFetch(`/projects/${projectId}/endpoints/${endpointId}`, {
    method: "DELETE",
  });
}

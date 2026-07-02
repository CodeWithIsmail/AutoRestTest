// Typed wrappers around the collaboration endpoints (members + invitations).

import { apiFetch } from "./api";
import type {
  CreateInvitationInput,
  InvitationItem,
  MemberItem,
  MemberList,
  MyInvitationItem,
  Role,
} from "./types";

// --- members ----------------------------------------------------------------

export function listMembers(projectId: string): Promise<MemberList> {
  return apiFetch<MemberList>(`/projects/${projectId}/members`);
}

export function updateMemberRole(
  projectId: string,
  userId: string,
  role: Role,
): Promise<MemberItem> {
  return apiFetch<MemberItem>(`/projects/${projectId}/members/${userId}`, {
    method: "PATCH",
    body: { role },
  });
}

export function removeMember(
  projectId: string,
  userId: string,
): Promise<{ message: string }> {
  return apiFetch(`/projects/${projectId}/members/${userId}`, {
    method: "DELETE",
  });
}

export function leaveProject(
  projectId: string,
): Promise<{ message: string }> {
  return apiFetch(`/projects/${projectId}/members/me`, { method: "DELETE" });
}

// --- project invitations (owner/admin) --------------------------------------

export function listInvitations(
  projectId: string,
): Promise<InvitationItem[]> {
  return apiFetch<InvitationItem[]>(`/projects/${projectId}/invitations`);
}

export function createInvitation(
  projectId: string,
  input: CreateInvitationInput,
): Promise<InvitationItem> {
  return apiFetch<InvitationItem>(`/projects/${projectId}/invitations`, {
    method: "POST",
    body: input,
  });
}

export function revokeInvitation(
  projectId: string,
  invitationId: string,
): Promise<{ message: string }> {
  return apiFetch(`/projects/${projectId}/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

// --- my invitations (the invitee's view) ------------------------------------

export function listMyInvitations(): Promise<MyInvitationItem[]> {
  return apiFetch<MyInvitationItem[]>(`/invitations`);
}

export function acceptInvitation(
  token: string,
): Promise<{ message: string; projectId: string; role: Role }> {
  return apiFetch(`/invitations/${token}/accept`, { method: "POST" });
}

export function declineInvitation(
  token: string,
): Promise<{ message: string }> {
  return apiFetch(`/invitations/${token}/decline`, { method: "POST" });
}

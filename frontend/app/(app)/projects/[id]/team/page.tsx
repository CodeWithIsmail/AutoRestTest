"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useProject } from "@/components/projects/project-context";
import { InviteModal } from "@/components/projects/InviteModal";
import { useToast } from "@/components/toast";
import { Badge, roleTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import {
  leaveProject,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "@/lib/collaboration";
import { useApi } from "@/lib/useApi";
import type { InvitationItem, MemberItem, Role } from "@/lib/types";

const ROLES: Role[] = ["admin", "tester", "viewer"];

function inviteTone(status: string): "amber" | "emerald" | "zinc" | "red" {
  switch (status) {
    case "pending":
      return "amber";
    case "accepted":
      return "emerald";
    case "expired":
      return "red";
    default:
      return "zinc";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TeamPage() {
  const { project, canManage } = useProject();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const {
    data: memberData,
    loading,
    error,
    reload: reloadMembers,
  } = useApi(() => listMembers(project.id), [project.id]);

  // Invitations are owner/admin-only on the backend; only fetch when allowed.
  const { data: invitations, reload: reloadInvites } = useApi<InvitationItem[]>(
    () => (canManage ? listInvitations(project.id) : Promise.resolve([])),
    [project.id],
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberItem | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<InvitationItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChangeRole(m: MemberItem, role: Role) {
    try {
      await updateMemberRole(project.id, m.userId, role);
      toast.success(`${m.username} is now ${role}.`);
      reloadMembers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to change role");
    }
  }

  async function onRemove() {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await removeMember(project.id, removeTarget.userId);
      toast.success("Member removed.");
      setRemoveTarget(null);
      reloadMembers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    setBusy(true);
    try {
      await leaveProject(project.id);
      toast.success("You have left the project.");
      router.push("/projects");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to leave");
      setBusy(false);
    }
  }

  async function onRevoke() {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      await revokeInvitation(project.id, revokeTarget.id);
      toast.success("Invitation revoked.");
      setRevokeTarget(null);
      reloadInvites();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke");
    } finally {
      setBusy(false);
    }
  }

  function copyToken(inv: InvitationItem) {
    void navigator.clipboard?.writeText(inv.token);
    toast.success("Invite token copied.");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-500" />
      </div>
    );
  }

  if (error || !memberData) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-400">{error ?? "Failed to load team."}</p>
      </div>
    );
  }

  const others = memberData.members.filter(
    (m) => m.userId !== memberData.owner.userId,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Members */}
      <Card className="overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3">
          <h3 className="text-sm font-semibold text-zinc-200">Members</h3>
        </div>
        <ul>
          {/* Owner */}
          <li className="flex items-center justify-between gap-3 border-b border-zinc-800/60 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-100">
                {memberData.owner.username}
                {memberData.owner.userId === user?.id && (
                  <span className="ml-1 text-zinc-500">(you)</span>
                )}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {memberData.owner.email}
              </p>
            </div>
            <Badge tone="emerald">Owner</Badge>
          </li>

          {/* Other members */}
          {others.map((m) => {
            const isSelf = m.userId === user?.id;
            return (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 border-b border-zinc-800/60 px-5 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-100">
                    {m.username}
                    {isSelf && <span className="ml-1 text-zinc-500">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{m.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage && !isSelf ? (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => onChangeRole(m, e.target.value as Role)}
                        className="h-8 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveTarget(m)}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Badge tone={roleTone(m.role)}>{m.role}</Badge>
                  )}
                  {isSelf && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLeaveOpen(true)}
                    >
                      Leave
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          {others.length === 0 && (
            <li className="px-5 py-6 text-center text-xs text-zinc-500">
              No other members yet.
            </li>
          )}
        </ul>
      </Card>

      {/* Invitations (owner/admin) */}
      {canManage && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
            <h3 className="text-sm font-semibold text-zinc-200">Invitations</h3>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              + Invite
            </Button>
          </div>
          {!invitations || invitations.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              No invitations yet. Invite a teammate by email.
            </p>
          ) : (
            <ul>
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 border-b border-zinc-800/60 px-5 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-100">
                      {inv.email}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {inv.role} · expires {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={inviteTone(inv.status)}>{inv.status}</Badge>
                    {inv.status === "pending" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToken(inv)}
                        >
                          Copy token
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokeTarget(inv)}
                        >
                          Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {inviteOpen && (
        <InviteModal
          projectId={project.id}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false);
            reloadInvites();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove member"
        message={
          <>
            Remove{" "}
            <span className="font-medium text-zinc-100">
              {removeTarget?.username}
            </span>{" "}
            from this project?
          </>
        }
        confirmLabel="Remove"
        danger
        loading={busy}
        onConfirm={onRemove}
        onClose={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={leaveOpen}
        title="Leave project"
        message="You will lose access to this project. Continue?"
        confirmLabel="Leave"
        danger
        loading={busy}
        onConfirm={onLeave}
        onClose={() => setLeaveOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke invitation"
        message={
          <>
            Revoke the invitation for{" "}
            <span className="font-medium text-zinc-100">
              {revokeTarget?.email}
            </span>
            ?
          </>
        }
        confirmLabel="Revoke"
        danger
        loading={busy}
        onConfirm={onRevoke}
        onClose={() => setRevokeTarget(null)}
      />
    </div>
  );
}

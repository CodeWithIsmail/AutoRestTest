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
import { errMsg } from "@/lib/api";
import {
  leaveProject,
  removeMember,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
} from "@/lib/collaboration";
import { membersOptions, projectInvitationsOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InvitationItem,
  MemberItem,
  MemberList,
  Role,
} from "@/lib/types";

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

  const queryClient = useQueryClient();
  const membersKey = qk.projects.members(project.id);

  const { data: memberData, isPending, error } = useQuery(
    membersOptions(project.id),
  );

  // Invitations are owner/admin-only on the backend; only fetch when allowed.
  // With `enabled: false` the data is `undefined` rather than the `[]` the old
  // conditional promise returned, so consumers below default it.
  const { data: invitations } = useQuery({
    ...projectInvitationsOptions(project.id),
    enabled: canManage,
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberItem | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<InvitationItem | null>(null);
  // Its own flag rather than the shared confirm-dialog state — resending must
  // only disable the one row's button.
  const [resendingId, setResendingId] = useState<string | null>(null);

  function reloadMembers() {
    void queryClient.invalidateQueries({ queryKey: membersKey });
  }

  function reloadInvites() {
    void queryClient.invalidateQueries({
      queryKey: qk.projects.invitations(project.id),
    });
  }

  // Optimistic: the select shows the new role the instant it is picked. This
  // is the one control on the page that previously had no in-flight state at
  // all, so a slow request left it silently showing the old value.
  const roleMutation = useMutation({
    mutationFn: ({ member, role }: { member: MemberItem; role: Role }) =>
      updateMemberRole(project.id, member.userId, role),
    onMutate: async ({ member, role }) => {
      await queryClient.cancelQueries({ queryKey: membersKey });
      const previous = queryClient.getQueryData<MemberList>(membersKey);
      queryClient.setQueryData<MemberList>(membersKey, (current) =>
        current
          ? {
              ...current,
              members: current.members.map((m) =>
                m.userId === member.userId ? { ...m, role } : m,
              ),
            }
          : current,
      );
      return { previous };
    },
    onSuccess: (_result, { member, role }) =>
      toast.success(`${member.username} is now ${role}.`),
    onError: (err, _vars, context) => {
      if (context) queryClient.setQueryData(membersKey, context.previous);
      toast.error(errMsg(err, "Failed to change role"));
    },
    onSettled: reloadMembers,
  });

  const removeMutation = useMutation({
    mutationFn: (member: MemberItem) =>
      removeMember(project.id, member.userId),
    onSuccess: () => {
      toast.success("Member removed.");
      setRemoveTarget(null);
      reloadMembers();
      // Member counts live on the project detail and the projects list.
      void queryClient.invalidateQueries({
        queryKey: qk.projects.detail(project.id),
      });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
    },
    onError: (err) => toast.error(errMsg(err, "Failed to remove")),
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveProject(project.id),
    onSuccess: () => {
      toast.success("You have left the project.");
      queryClient.removeQueries({ queryKey: qk.projects.detail(project.id) });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      router.push("/projects");
    },
    onError: (err) => toast.error(errMsg(err, "Failed to leave")),
  });

  const revokeMutation = useMutation({
    mutationFn: (invitation: InvitationItem) =>
      revokeInvitation(project.id, invitation.id),
    onSuccess: () => {
      toast.success("Invitation revoked.");
      setRevokeTarget(null);
      reloadInvites();
    },
    onError: (err) => toast.error(errMsg(err, "Failed to revoke")),
  });

  const resendMutation = useMutation({
    mutationFn: (invitation: InvitationItem) =>
      resendInvitation(project.id, invitation.id),
    onSuccess: (_result, invitation) =>
      toast.success(`Invitation email sent to ${invitation.email}.`),
    onError: (err) => toast.error(errMsg(err, "Failed to send the email")),
    onSettled: () => setResendingId(null),
  });

  const onChangeRole = (m: MemberItem, role: Role) =>
    roleMutation.mutate({ member: m, role });
  const onRemove = () => removeTarget && removeMutation.mutate(removeTarget);
  const onLeave = () => leaveMutation.mutate();
  const onRevoke = () => revokeTarget && revokeMutation.mutate(revokeTarget);

  function onResend(inv: InvitationItem) {
    setResendingId(inv.id);
    resendMutation.mutate(inv);
  }

  // Shared by the confirm dialogs, as before.
  const busy =
    removeMutation.isPending ||
    leaveMutation.isPending ||
    revokeMutation.isPending;

  function copyToken(inv: InvitationItem) {
    void navigator.clipboard?.writeText(inv.token);
    toast.success("Invite token copied.");
  }

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  if (error || !memberData) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">
          {errMsg(error, "Failed to load team.")}
        </p>
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
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Members</h3>
        </div>
        <ul>
          {/* Owner */}
          <li className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/60 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
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
                className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/60 px-5 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
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
                        className="h-8 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-emerald-500 focus:outline-none"
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
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Invitations</h3>
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
                  className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/60 px-5 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
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
                          onClick={() => onResend(inv)}
                          loading={resendingId === inv.id}
                        >
                          Resend email
                        </Button>
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
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
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
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
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

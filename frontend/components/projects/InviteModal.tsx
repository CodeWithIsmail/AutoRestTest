"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { errMsg } from "@/lib/api";
import { createInvitation } from "@/lib/collaboration";
import { qk } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InvitationItem, Role } from "@/lib/types";

const ROLES: Role[] = ["admin", "tester", "viewer"];

const ROLE_HINT: Record<Role, string> = {
  admin: "Full access — manage spec, endpoints, runs, and team.",
  tester: "Can configure and run test suites.",
  viewer: "Read-only access to the project.",
};

interface InviteModalProps {
  projectId: string;
  onClose: () => void;
  onInvited: (invitation: InvitationItem) => void;
}

export function InviteModal({
  projectId,
  onClose,
  onInvited,
}: InviteModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("tester");

  const inviteMutation = useMutation({
    mutationFn: () =>
      createInvitation(projectId, { email: email.trim(), role }),
    onSuccess: (invitation) => {
      toast.success("Invitation created.");
      void queryClient.invalidateQueries({
        queryKey: qk.projects.invitations(projectId),
      });
      onInvited(invitation);
    },
    onError: (err) => toast.error(errMsg(err, "Something went wrong")),
  });

  const submitting = inviteMutation.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    inviteMutation.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite a teammate"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={submitting}>
            Send invite
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          label="Email"
          name="email"
          type="email"
          placeholder="teammate@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Role
          </label>
          <Select
            id="role"
            value={role}
            onChange={(v) => setRole(v as Role)}
            options={ROLES.map((r) => ({
              value: r,
              label: r[0].toUpperCase() + r.slice(1),
            }))}
          />
          <p className="text-xs text-zinc-500">{ROLE_HINT[role]}</p>
        </div>
        <p className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
          An invite link is emailed to this address. Your teammate can also
          accept it from their Invitations page after signing in with it.
        </p>
      </form>
    </Modal>
  );
}

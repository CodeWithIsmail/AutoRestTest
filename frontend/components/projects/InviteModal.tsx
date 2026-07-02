"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api";
import { createInvitation } from "@/lib/collaboration";
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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("tester");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const invitation = await createInvitation(projectId, {
        email: email.trim(),
        role,
      });
      toast.success("Invitation created.");
      onInvited(invitation);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Something went wrong",
      );
      setSubmitting(false);
    }
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
          <label htmlFor="role" className="text-sm font-medium text-zinc-300">
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">{ROLE_HINT[role]}</p>
        </div>
        <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
          No email is sent. After inviting, copy the invite link to share, or
          the teammate can accept it from their Invitations page.
        </p>
      </form>
    </Modal>
  );
}

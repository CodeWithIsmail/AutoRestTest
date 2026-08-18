"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Card } from "@/components/ui/Card";
import { ApiError } from "@/lib/api";
import type { UpdateNotificationsInput, User } from "@/lib/types";
import { updateNotifications } from "@/lib/users";

export function NotificationsCard({ user }: { user: User }) {
  const toast = useToast();
  const { applyUser } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(field: keyof UpdateNotificationsInput, value: boolean) {
    setSaving(field);
    try {
      // Saved on change rather than behind a button: two checkboxes do not
      // need a form, and the toast is enough confirmation.
      const updated = await updateNotifications({ [field]: value });
      applyUser(updated);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not save that",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Notifications</h2>
      <p className="mt-0.5 text-sm text-zinc-500">
        Security messages — verification codes, reset links, and password
        changes — are always sent.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <Toggle
          label="Test run finished"
          hint="Email me when a run I started completes or fails."
          checked={user.notifyRunFinished}
          busy={saving === "notifyRunFinished"}
          onChange={(v) => void toggle("notifyRunFinished", v)}
        />
        <Toggle
          label="Project invitations"
          hint="Email me when someone invites me to a project. Invitations still appear in the app either way."
          checked={user.notifyInvitations}
          busy={saving === "notifyInvitations"}
          onChange={(v) => void toggle("notifyInvitations", v)}
        />
      </div>
    </Card>
  );
}

function Toggle({
  label,
  hint,
  checked,
  busy,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  busy: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-emerald-500"
      />
      <span>
        <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
    </label>
  );
}

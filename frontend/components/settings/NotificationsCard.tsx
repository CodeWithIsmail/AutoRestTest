"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Card } from "@/components/ui/Card";
import { errMsg } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { UpdateNotificationsInput, User } from "@/lib/types";
import { updateNotifications } from "@/lib/users";

export function NotificationsCard({ user }: { user: User }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { applyUser } = useAuth();

  // Optimistic: a checkbox that waits for a round trip before moving reads as
  // broken. The box flips at once and flips back if the save fails.
  const saveMutation = useMutation({
    mutationFn: (input: UpdateNotificationsInput) =>
      updateNotifications(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: qk.me });
      const previous = queryClient.getQueryData<User>(qk.me);
      queryClient.setQueryData<User>(qk.me, (current) =>
        current ? { ...current, ...input } : current,
      );
      return { previous };
    },
    // Saved on change rather than behind a button: two checkboxes do not need
    // a form, and the box moving is enough confirmation.
    onSuccess: (updated) => applyUser(updated),
    onError: (err, _input, context) => {
      if (context) queryClient.setQueryData(qk.me, context.previous);
      toast.error(errMsg(err, "Could not save that"));
    },
  });

  const saving = saveMutation.isPending
    ? Object.keys(saveMutation.variables ?? {})[0]
    : null;

  function toggle(field: keyof UpdateNotificationsInput, value: boolean) {
    saveMutation.mutate({ [field]: value });
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
          onChange={(v) => toggle("notifyRunFinished", v)}
        />
        <Toggle
          label="Project invitations"
          hint="Email me when someone invites me to a project. Invitations still appear in the app either way."
          checked={user.notifyInvitations}
          busy={saving === "notifyInvitations"}
          onChange={(v) => toggle("notifyInvitations", v)}
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

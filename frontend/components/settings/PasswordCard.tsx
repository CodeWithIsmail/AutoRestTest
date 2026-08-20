"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/Input";
import { errMsg } from "@/lib/api";
import { changePassword } from "@/lib/users";
import { useMutation } from "@tanstack/react-query";

export function PasswordCard() {
  const router = useRouter();
  const toast = useToast();
  const { logout } = useAuth();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const changeMutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      // The backend stamps passwordChangedAt, which kills the token this page
      // is holding. Signing out is not a precaution — staying put would 401 on
      // the very next request with no explanation. `logout` also clears the
      // query cache, in memory and on disk.
      logout();
      toast.success("Password changed. Please sign in again.");
      router.replace("/login");
    },
    onError: (err) => setError(errMsg(err, "Something went wrong")),
  });

  const submitting = changeMutation.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("Both new passwords must match.");
      return;
    }
    setError(null);
    changeMutation.mutate();
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Password</h2>
      <p className="mt-0.5 text-sm text-zinc-500">
        Changing it signs you out on every device, including this one.
      </p>

      <form onSubmit={onSubmit} className="mt-5 flex max-w-sm flex-col gap-4">
        <FormField
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <FormField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <FormField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={error ?? undefined}
        />

        <div>
          <Button type="submit" loading={submitting}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

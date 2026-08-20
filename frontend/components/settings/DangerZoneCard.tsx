"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { errMsg } from "@/lib/api";
import { projectsOptions } from "@/lib/queries";
import { deleteAccount } from "@/lib/users";
import { useMutation, useQuery } from "@tanstack/react-query";

export function DangerZoneCard({ userId }: { userId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { logout } = useAuth();

  const [open, setOpen] = useState(false);

  // Owned projects go with the account, so say how many before asking.
  const { data: projects } = useQuery(projectsOptions());
  const ownedCount = (projects ?? []).filter((p) => p.ownerId === userId).length;

  return (
    <>
      <Card className="border-red-500/25 p-6">
        <h2 className="text-base font-semibold text-red-600 dark:text-red-400">Danger zone</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Deleting your account is permanent and cannot be undone.
        </p>

        <div className="mt-5">
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete my account
          </Button>
        </div>
      </Card>

      {/* Mounted only when open, so the password field resets every time. */}
      {open && (
        <DeleteAccountModal
          ownedCount={ownedCount}
          onClose={() => setOpen(false)}
          onDeleted={() => {
            logout();
            toast.success("Your account has been deleted.");
            router.replace("/register");
          }}
        />
      )}
    </>
  );
}

function DeleteAccountModal({
  ownedCount,
  onClose,
  onDeleted,
}: {
  ownedCount: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(password),
    // The caller signs out, which clears the cache in memory and on disk.
    onSuccess: () => onDeleted(),
    onError: (err) => setError(errMsg(err, "Something went wrong")),
  });

  const submitting = deleteMutation.isPending;

  function onConfirm() {
    setError(null);
    deleteMutation.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete your account"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={submitting}
            disabled={!password}
            onClick={onConfirm}
          >
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          This permanently removes your account
          {ownedCount > 0 && (
            <>
              {" "}
              and the{" "}
              <span className="font-medium text-red-600 dark:text-red-400">
                {ownedCount} project{ownedCount === 1 ? "" : "s"} you own
              </span>
              , including every specification, test run and captured request in
              them
            </>
          )}
          . Your teammates lose access too. This cannot be undone.
        </p>
        <FormField
          label="Enter your password to confirm"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
        />
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { errMsg } from "@/lib/api";
import { deleteProject } from "@/lib/projects";
import { useMutation } from "@tanstack/react-query";

/**
 * Irreversible, so unlike a plain yes/no confirm this requires the owner to
 * type the project's name (proves they're looking at the right project) and
 * re-enter their password (proves an unattended session can't trigger it),
 * mirroring the account-deletion modal in DangerZoneCard.tsx.
 */
export function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: { id: string; name: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typedName, setTypedName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(project.id, password),
    onSuccess: () => onDeleted(),
    onError: (err) => setError(errMsg(err, "Something went wrong")),
  });

  const submitting = deleteMutation.isPending;
  const nameMatches = typedName === project.name;

  function onConfirm() {
    setError(null);
    deleteMutation.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete project"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={submitting}
            disabled={!nameMatches || !password}
            onClick={onConfirm}
          >
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          This permanently removes{" "}
          <span className="font-medium text-red-600 dark:text-red-400">{project.name}</span>{" "}
          and all its data — spec, endpoints, test suites, and captured requests. Your
          teammates lose access too. This cannot be undone.
        </p>
        <FormField
          label={`Type "${project.name}" to confirm`}
          name="projectName"
          autoComplete="off"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
        />
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

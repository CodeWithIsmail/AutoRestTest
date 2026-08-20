"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { FormField, TextareaField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { errMsg } from "@/lib/api";
import { createProject, updateProject } from "@/lib/projects";
import { qk } from "@/lib/query-keys";
import type { ProjectDetail } from "@/lib/types";

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (project: ProjectDetail) => void;
  /** When set, the modal edits this project; otherwise it creates a new one. */
  project?: { id: string; name: string; description: string | null } | null;
}

export function ProjectFormModal({
  open,
  onClose,
  onSaved,
  project,
}: ProjectFormModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(project);

  // The parent mounts this modal only when open, so initializing from props
  // gives a fresh, correctly-prefilled form on every open (no effect needed).
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");

  // The modal owns the invalidation rather than the caller, because both
  // callers (the list page and the project header) need the same refresh and
  // one of them used to forget the list.
  const saveMutation = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      isEdit && project ? updateProject(project.id, body) : createProject(body),
    onSuccess: (saved) => {
      toast.success(isEdit ? "Project updated." : "Project created.");
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      if (project) {
        queryClient.setQueryData(qk.projects.detail(project.id), saved);
      }
      onSaved(saved);
    },
    onError: (err) => {
      toast.error(errMsg(err, "Something went wrong"));
    },
  });

  const submitting = saveMutation.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit project" : "New project"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={submitting}>
            {isEdit ? "Save changes" : "Create project"}
          </Button>
        </>
      }
    >
      <form
        id="project-form"
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        <FormField
          label="Name"
          name="name"
          placeholder="My API Project"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextareaField
          label="Description (optional)"
          name="description"
          placeholder="What does this project test?"
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </form>
    </Modal>
  );
}

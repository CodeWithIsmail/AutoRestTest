"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { FormField, TextareaField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api";
import { createProject, updateProject } from "@/lib/projects";
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
  const isEdit = Boolean(project);

  // The parent mounts this modal only when open, so initializing from props
  // gives a fresh, correctly-prefilled form on every open (no effect needed).
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
      };
      const saved =
        isEdit && project
          ? await updateProject(project.id, body)
          : await createProject(body);
      toast.success(isEdit ? "Project updated." : "Project created.");
      onSaved(saved);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Something went wrong",
      );
      setSubmitting(false);
    }
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

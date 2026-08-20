"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { FormField, TextareaField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { errMsg } from "@/lib/api";
import { createEndpoint } from "@/lib/endpoints";
import { qk } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { EndpointItem, HttpMethod } from "@/lib/types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

interface AddEndpointModalProps {
  projectId: string;
  onClose: () => void;
  onSaved: (endpoint: EndpointItem) => void;
}

export function AddEndpointModal({
  projectId,
  onClose,
  onSaved,
}: AddEndpointModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      createEndpoint(projectId, {
        method,
        path: path.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: (saved) => {
      toast.success("Endpoint added.");
      void queryClient.invalidateQueries({
        queryKey: qk.projects.endpoints(projectId),
      });
      onSaved(saved);
    },
    onError: (err) => toast.error(errMsg(err, "Something went wrong")),
  });

  const submitting = createMutation.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add endpoint"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="endpoint-form" loading={submitting}>
            Add endpoint
          </Button>
        </>
      }
    >
      <form
        id="endpoint-form"
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="method" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Method
          </label>
          <select
            id="method"
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            className="h-10 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <FormField
          label="Path"
          name="path"
          placeholder="/users/{id}"
          required
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <TextareaField
          label="Description (optional)"
          name="description"
          placeholder="What does this endpoint do?"
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </form>
    </Modal>
  );
}

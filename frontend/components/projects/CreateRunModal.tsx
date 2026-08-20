"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { errMsg } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { createSuite } from "@/lib/test-suites";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TestSuiteDetail } from "@/lib/types";

interface CreateRunModalProps {
  projectId: string;
  onClose: () => void;
  onCreated: (suite: TestSuiteDetail) => void;
}

export function CreateRunModal({
  projectId,
  onClose,
  onCreated,
}: CreateRunModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [timeBudget, setTimeBudget] = useState("30");
  const [mutationRate, setMutationRate] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      createSuite(projectId, {
        name: name.trim() || undefined,
        targetUrl: targetUrl.trim(),
        timeBudget: Number(timeBudget),
        mutationRate:
          mutationRate.trim() === "" ? undefined : Number(mutationRate),
      }),
    onSuccess: (suite) => {
      toast.success("Run created.");
      // Seed the detail the caller is about to navigate to, so the run page
      // opens with data instead of a spinner.
      queryClient.setQueryData(qk.suites.detail(projectId, suite.id), suite);
      void queryClient.invalidateQueries({ queryKey: qk.suites.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      onCreated(suite);
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
      title="New test run"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="run-form" loading={submitting}>
            Create
          </Button>
        </>
      }
    >
      <form id="run-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          label="Name (optional)"
          name="name"
          placeholder="Smoke run"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <FormField
          label="Target URL"
          name="targetUrl"
          type="url"
          placeholder="https://api.example.com"
          required
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
        />
        <p className="-mt-2 text-xs text-zinc-500">
          The live base URL the engine sends requests to.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Time budget (seconds)"
            name="timeBudget"
            type="number"
            min={1}
            max={3600}
            required
            value={timeBudget}
            onChange={(e) => setTimeBudget(e.target.value)}
          />
          <FormField
            label="Mutation rate (0–1)"
            name="mutationRate"
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="0.2"
            value={mutationRate}
            onChange={(e) => setMutationRate(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}

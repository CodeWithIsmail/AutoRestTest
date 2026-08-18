"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import {
  applyGeneration,
  discardGeneration,
  getGeneration,
  startGeneration,
} from "@/lib/spec-generation";
import type { SpecGeneration } from "@/lib/types";

const POLL_MS = 5000;

/** Vendored trees dominate both analysis cost and wall time. */
const DEFAULT_IGNORE = "node_modules, dist, build, coverage, venv, __pycache__";

interface GenerateSpecPanelProps {
  projectId: string;
  projectName: string;
  /** Whether the caller may start/apply/discard a generation. */
  canManage: boolean;
  /** True when the project already has a spec that applying would replace. */
  hasSpec: boolean;
  /** Called after the generated spec becomes the project's spec. */
  onApplied: () => void;
}

function elapsedSince(iso: string | null): string {
  if (!iso) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m elapsed`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s elapsed`;
  return `${seconds}s elapsed`;
}

export function GenerateSpecPanel({
  projectId,
  projectName,
  canManage,
  hasSpec,
  onApplied,
}: GenerateSpecPanelProps) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [generation, setGeneration] = useState<SpecGeneration | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [tick, setTick] = useState(0);

  const [title, setTitle] = useState(projectName);
  const [version, setVersion] = useState("1.0.0");
  const [ignorePath, setIgnorePath] = useState(DEFAULT_IGNORE);

  // Initial load, kept separate from polling so a refresh never flickers.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await getGeneration(projectId);
        if (active) setGeneration(current);
      } catch {
        // A missing generation is not an error state; the idle form renders.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  // Poll silently while a generation is in flight. The `tick` bump also drives
  // the elapsed-time readout between polls.
  const status = generation?.status;
  useEffect(() => {
    if (status !== "running") return;
    let active = true;
    const iv = setInterval(() => {
      setTick((t) => t + 1);
      void (async () => {
        try {
          const next = await getGeneration(projectId);
          if (active && next) setGeneration(next);
        } catch {
          // Transient poll errors are ignored; the next tick retries.
        }
      })();
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [status, projectId]);

  async function onStart(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Please upload your source code as a .zip archive.");
      return;
    }
    setStarting(true);
    try {
      const started = await startGeneration(projectId, file, {
        title,
        version,
        ignorePath,
      });
      setGeneration(started);
      toast.success("Analysing your codebase — this can take a while.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not start generation",
      );
    } finally {
      setStarting(false);
    }
  }

  async function onApply() {
    setApplying(true);
    try {
      await applyGeneration(projectId);
      setGeneration(null);
      setConfirmApply(false);
      toast.success("Specification applied — endpoints extracted.");
      onApplied();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not apply the spec",
      );
    } finally {
      setApplying(false);
    }
  }

  async function onDiscard() {
    setDiscarding(true);
    try {
      await discardGeneration(projectId);
      setGeneration(null);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not discard",
      );
    } finally {
      setDiscarding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  // --- Running --------------------------------------------------------------
  if (generation?.status === "running" || generation?.status === "pending") {
    const { stepIndex, stepTotal, step } = generation;
    const pct = stepTotal > 0 ? Math.round((stepIndex / stepTotal) * 100) : 0;
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {step ?? "Preparing the analysis"}
        </p>
        <p className="text-xs text-zinc-500">
          Step {Math.max(1, stepIndex)} of {stepTotal}
          {generation.startedAt
            ? ` · ${elapsedSince(generation.startedAt)}`
            : ""}
          <span className="hidden">{tick}</span>
        </p>
        <div className="mt-1 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 max-w-md text-xs text-zinc-500">
          Reading your source code and inferring endpoints with an LLM. Large
          projects can take a long time. This page updates automatically — you
          can leave and come back.
        </p>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            loading={discarding}
            onClick={onDiscard}
          >
            Cancel
          </Button>
        )}
      </Card>
    );
  }

  // --- Failed ---------------------------------------------------------------
  if (generation?.status === "failed") {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Generation failed
        </h3>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {generation.error ?? "The analysis did not complete."}
        </p>
        {canManage && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={discarding}
            onClick={onDiscard}
          >
            Try again
          </Button>
        )}
      </Card>
    );
  }

  // --- Completed, awaiting review -------------------------------------------
  if (generation?.status === "completed") {
    return (
      <div className="flex flex-col gap-6">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  Specification ready for review
                </h3>
                <Badge tone="purple">AI-generated</Badge>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Generated from {generation.sourceName} ·{" "}
                {generation.operationCount} operations found
              </p>
            </div>
            {canManage && (
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  loading={applying}
                  onClick={() =>
                    hasSpec ? setConfirmApply(true) : void onApply()
                  }
                >
                  Use this specification
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={discarding}
                  onClick={onDiscard}
                >
                  Discard
                </Button>
              </div>
            )}
          </div>

          {generation.warnings.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
              {generation.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2">
                  <Badge tone="amber">Note</Badge>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">{warning}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <button
            onClick={() => setShowRaw((s) => !s)}
            className="text-sm font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            {showRaw ? "Hide generated spec" : "Review generated spec"}
          </button>
          {showRaw && (
            <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-xs text-zinc-700 dark:text-zinc-300">
              {generation.generatedSpec}
            </pre>
          )}
        </Card>

        <ConfirmDialog
          open={confirmApply}
          title="Replace API spec"
          message="Applying this specification replaces the project's current spec, re-extracts endpoints, and removes any manually-added ones. Continue?"
          confirmLabel="Replace"
          loading={applying}
          onConfirm={onApply}
          onClose={() => setConfirmApply(false)}
        />
      </div>
    );
  }

  // --- Idle -----------------------------------------------------------------
  if (!canManage) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Only project owners and admins can generate a specification.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={fileInput}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onStart(file);
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="API title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My API"
        />
        <FormField
          label="Version"
          name="version"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="1.0.0"
        />
      </div>

      <FormField
        label="Exclude directories"
        name="ignorePath"
        value={ignorePath}
        onChange={(e) => setIgnorePath(e.target.value)}
        placeholder="node_modules, dist"
      />
      <p className="-mt-3 text-xs text-zinc-500">
        Comma-separated. Excluding vendored and build directories makes the
        analysis dramatically faster and cheaper.
      </p>

      <div
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void onStart(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
          dragging
            ? "border-emerald-500 bg-emerald-500/5"
            : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-900/50"
        }`}
      >
        {starting ? (
          <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
        ) : (
          <>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Drop your source code here, or click to browse
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              A .zip of the API project · up to 50 MB
            </p>
            <p className="mt-3 max-w-md text-xs text-zinc-500">
              The system reads your code and infers an OpenAPI specification.
              You review it before it is applied.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

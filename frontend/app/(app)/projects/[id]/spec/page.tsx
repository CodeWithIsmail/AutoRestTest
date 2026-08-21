"use client";

import { useRef, useState } from "react";
import { GenerateSpecPanel } from "@/components/projects/GenerateSpecPanel";
import { useProject } from "@/components/projects/project-context";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { errMsg } from "@/lib/api";
import { generationOptions, specOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import { deleteSpec, uploadSpec } from "@/lib/specs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const ACCEPT = ".json,.yaml,.yml";
const VALID_EXT = /\.(json|ya?ml)$/i;

type SpecMode = "file" | "codebase";

const MODES: { value: SpecMode; label: string }[] = [
  { value: "file", label: "Upload OAS file" },
  { value: "codebase", label: "Generate from source code" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function mimeForFileName(fileName: string): string {
  return /\.(ya?ml)$/i.test(fileName) ? "application/yaml" : "application/json";
}

function downloadSpecFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: mimeForFileName(fileName) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "openapi-spec.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export default function SpecPage() {
  const { project, canManage } = useProject();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: spec, isPending, error } = useQuery(specOptions(project.id));

  // A generation in flight (or awaiting review) must not be hidden behind an
  // unselected tab, so it decides which tab opens. Shares its cache entry with
  // GenerateSpecPanel, which used to fetch the same job separately.
  const { data: generation } = useQuery(generationOptions(project.id));

  // Derived rather than synced from an effect: `null` means the user has not
  // picked a tab yet, so the generation decides. Once they do pick, their
  // choice wins permanently — which is what stops the tab snapping back to
  // "codebase" every time the generation poll returns.
  const [modeChoice, setModeChoice] = useState<SpecMode | null>(null);
  const mode: SpecMode = modeChoice ?? (generation ? "codebase" : "file");
  const setMode = setModeChoice;

  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<File | null>(null);

  /**
   * Changing the spec rewrites the endpoint list and invalidates the
   * dependency graph, and it moves the `specStatus` badge on the projects
   * list — which is exactly the badge that used to sit there stale until a
   * manual refresh.
   */
  function invalidateSpecDependents() {
    void queryClient.invalidateQueries({
      queryKey: qk.projects.spec(project.id),
    });
    void queryClient.invalidateQueries({
      queryKey: qk.projects.endpoints(project.id),
    });
    void queryClient.invalidateQueries({
      queryKey: qk.projects.graph(project.id),
    });
    void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadSpec(project.id, file),
    onSuccess: () => {
      toast.success("Spec uploaded — endpoints extracted.");
      invalidateSpecDependents();
    },
    onError: (err) => toast.error(errMsg(err, "Upload failed")),
  });

  function doUpload(file: File) {
    if (!VALID_EXT.test(file.name)) {
      toast.error("Please choose a .json, .yaml, or .yml file.");
      return;
    }
    uploadMutation.mutate(file);
  }

  // When a spec already exists, uploading replaces all endpoints — confirm first.
  function onFilePicked(file: File | undefined) {
    if (!file) return;
    if (spec) setPendingReplace(file);
    else doUpload(file);
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteSpec(project.id),
    onSuccess: () => {
      toast.success("Spec deleted.");
      setDeleteOpen(false);
      invalidateSpecDependents();
    },
    onError: (err) => toast.error(errMsg(err, "Delete failed")),
  });

  const uploading = uploadMutation.isPending;

  async function copySpec(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — your browser blocked clipboard access.");
    }
  }

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">
          {errMsg(error, "Failed to load the specification")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: qk.projects.spec(project.id),
            })
          }
        >
          Retry
        </Button>
      </div>
    );
  }

  // Both ways of getting a spec live on this screen; the tabs pick between
  // them. Only shown to members who may actually change the spec.
  const modeTabs = canManage ? (
    <SegmentedControl
      segments={MODES}
      value={mode}
      onChange={setMode}
      className="mb-6"
    />
  ) : null;

  if (canManage && mode === "codebase") {
    return (
      <>
        {modeTabs}
        <GenerateSpecPanel
          projectId={project.id}
          projectName={project.name}
          canManage={canManage}
          hasSpec={Boolean(spec)}
          onApplied={() => setMode("file")}
        />
      </>
    );
  }

  // Hidden input shared by the dropzone and the Replace button.
  const hiddenInput = (
    <input
      ref={fileInput}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        onFilePicked(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  // --- No spec yet ----------------------------------------------------------
  if (!spec) {
    if (!canManage) {
      return (
        <Card className="p-10 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No API specification has been uploaded for this project yet.
          </p>
        </Card>
      );
    }
    return (
      <>
        {modeTabs}
        {hiddenInput}
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
            onFilePicked(e.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
            dragging
              ? "border-emerald-500 bg-emerald-500/5"
              : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-900/50"
          }`}
        >
          {uploading ? (
            <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Drop an OpenAPI file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                OpenAPI 3.x · .json, .yaml, or .yml
              </p>
              <p className="mt-3 text-xs text-zinc-500">
                Endpoints are extracted automatically on upload.
              </p>
            </>
          )}
        </div>
      </>
    );
  }

  // --- Spec exists ----------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      {modeTabs}
      {hiddenInput}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {spec.title || spec.fileName}
              </h2>
              <Badge tone="blue">OpenAPI {spec.openapiVersion}</Badge>
              {spec.generatedByAI && <Badge tone="purple">AI-generated</Badge>}
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{spec.fileName}</p>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                Replace
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Endpoints</dt>
            <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{spec.endpointCount}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Uploaded</dt>
            <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
              {formatDate(spec.uploadedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Version</dt>
            <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{spec.openapiVersion}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Raw spec
          </h3>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => copySpec(spec.fileContent)}
              title={copied ? "Copied" : "Copy to clipboard"}
              aria-label="Copy spec to clipboard"
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => downloadSpecFile(spec.fileName, spec.fileContent)}
              title="Download spec"
              aria-label="Download spec file"
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <DownloadIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-xs text-zinc-700 dark:text-zinc-300">
          {spec.fileContent}
        </pre>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete API spec"
        message="This removes the stored OpenAPI spec. Endpoints already extracted from it stay in the project (delete them from the Endpoints tab if you want them gone)."
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingReplace)}
        title="Replace API spec"
        message="Replacing the spec re-extracts endpoints and removes any manually-added ones. Continue?"
        confirmLabel="Replace"
        loading={uploading}
        onConfirm={() => {
          const f = pendingReplace;
          setPendingReplace(null);
          if (f) doUpload(f);
        }}
        onClose={() => setPendingReplace(null)}
      />
    </div>
  );
}

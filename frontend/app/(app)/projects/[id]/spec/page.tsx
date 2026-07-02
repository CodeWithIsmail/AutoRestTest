"use client";

import { useRef, useState } from "react";
import { useProject } from "@/components/projects/project-context";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { deleteSpec, getSpec, uploadSpec } from "@/lib/specs";
import { useApi } from "@/lib/useApi";

const ACCEPT = ".json,.yaml,.yml";
const VALID_EXT = /\.(json|ya?ml)$/i;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function SpecPage() {
  const { project, canManage } = useProject();
  const toast = useToast();
  const {
    data: spec,
    loading,
    error,
    reload,
  } = useApi(() => getSpec(project.id), [project.id]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<File | null>(null);

  async function doUpload(file: File) {
    if (!VALID_EXT.test(file.name)) {
      toast.error("Please choose a .json, .yaml, or .yml file.");
      return;
    }
    setUploading(true);
    try {
      await uploadSpec(project.id, file);
      toast.success("Spec uploaded — endpoints extracted.");
      reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Upload failed",
      );
    } finally {
      setUploading(false);
    }
  }

  // When a spec already exists, uploading replaces all endpoints — confirm first.
  function onFilePicked(file: File | undefined) {
    if (!file) return;
    if (spec) setPendingReplace(file);
    else void doUpload(file);
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteSpec(project.id);
      toast.success("Spec deleted.");
      setDeleteOpen(false);
      reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Delete failed",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          Retry
        </Button>
      </div>
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
          <p className="text-sm text-zinc-400">
            No API specification has been uploaded for this project yet.
          </p>
        </Card>
      );
    }
    return (
      <>
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
              : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/50"
          }`}
        >
          {uploading ? (
            <Spinner className="h-6 w-6 text-emerald-500" />
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-200">
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
      {hiddenInput}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-50">
                {spec.title || spec.fileName}
              </h2>
              <Badge tone="blue">OpenAPI {spec.openapiVersion}</Badge>
              {spec.generatedByAI && <Badge tone="purple">AI-generated</Badge>}
            </div>
            <p className="mt-1 text-sm text-zinc-400">{spec.fileName}</p>
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

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Endpoints</dt>
            <dd className="mt-0.5 text-zinc-200">{spec.endpointCount}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Uploaded</dt>
            <dd className="mt-0.5 text-zinc-200">
              {formatDate(spec.uploadedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Version</dt>
            <dd className="mt-0.5 text-zinc-200">{spec.openapiVersion}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5">
        <button
          onClick={() => setShowRaw((s) => !s)}
          className="text-sm font-medium text-emerald-500 hover:text-emerald-400"
        >
          {showRaw ? "Hide raw spec" : "View raw spec"}
        </button>
        {showRaw && (
          <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
            {spec.fileContent}
          </pre>
        )}
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete API spec"
        message="This removes the stored OpenAPI spec. Endpoints already extracted from it stay in the project (delete them from the Endpoints tab if you want them gone)."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={onDelete}
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
          if (f) void doUpload(f);
        }}
        onClose={() => setPendingReplace(null)}
      />
    </div>
  );
}

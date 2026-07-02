"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProject } from "@/components/projects/project-context";
import { CreateRunModal } from "@/components/projects/CreateRunModal";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Spinner } from "@/components/ui/Spinner";
import { StatusBadge } from "@/components/ui/Badge";
import { ApiError } from "@/lib/api";
import { deleteSuite, listSuites } from "@/lib/test-suites";
import { useApi } from "@/lib/useApi";
import type { TestSuiteSummary } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function suiteLabel(s: TestSuiteSummary): string {
  return s.name || `Run ${s.id.slice(0, 8)}`;
}

export default function TestSuitesPage() {
  const { project, canRun, canManage } = useProject();
  const router = useRouter();
  const toast = useToast();
  const {
    data: suites,
    loading,
    error,
    reload,
  } = useApi(() => listSuites(project.id), [project.id]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestSuiteSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSuite(project.id, deleteTarget.id);
      toast.success("Run deleted.");
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const base = `/projects/${project.id}/test-suites`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Configure and run AI-generated test suites against a live API.
        </p>
        {canRun && (
          <Button onClick={() => setCreateOpen(true)}>+ New run</Button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-emerald-500" />
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={reload}
            >
              Retry
            </Button>
          </div>
        ) : !suites || suites.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-zinc-400">
              No runs yet — create one to start testing your API.
            </p>
            {canRun && (
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                + New run
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-3 font-medium">Run</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Target</th>
                <th className="px-5 py-3 font-medium">Results</th>
                <th className="px-5 py-3 font-medium">Created</th>
                {canManage && <th className="w-10 px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {suites.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`${base}/${s.id}`)}
                  className="cursor-pointer border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-800/40"
                >
                  <td className="px-5 py-3 font-medium text-zinc-100">
                    {suiteLabel(s)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="max-w-xs truncate px-5 py-3 font-mono text-xs text-zinc-400">
                    {s.targetUrl}
                  </td>
                  <td className="px-5 py-3 text-zinc-400">
                    {s.status === "completed" ? (
                      <span>
                        <span className="text-emerald-400">
                          {s.passedTestCases}
                        </span>
                        {" / "}
                        {s.totalTestCases}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-400">
                    {formatDate(s.createdAt)}
                  </td>
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      <DropdownMenu
                        items={[
                          {
                            label: "Open",
                            onClick: () => router.push(`${base}/${s.id}`),
                          },
                          {
                            label: "Delete",
                            danger: true,
                            onClick: () => setDeleteTarget(s),
                          },
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <CreateRunModal
          projectId={project.id}
          onClose={() => setCreateOpen(false)}
          onCreated={(suite) => {
            setCreateOpen(false);
            router.push(`${base}/${suite.id}`);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete run"
        message={
          <>
            Delete{" "}
            <span className="font-medium text-zinc-100">
              {deleteTarget ? suiteLabel(deleteTarget) : ""}
            </span>
            ? This removes the run and all its test cases.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={onConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

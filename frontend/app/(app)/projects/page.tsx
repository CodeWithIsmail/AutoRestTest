"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { Badge, roleTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { deleteProject, listProjects } from "@/lib/projects";
import { useApi } from "@/lib/useApi";
import type { ProjectListItem } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ProjectsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { data: projects, loading, error, reload } = useApi(listProjects, []);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [projects, search]);

  function isOwner(p: ProjectListItem): boolean {
    return p.ownerId === user?.id;
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProject(deleteTarget.id);
      toast.success("Project deleted.");
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to delete project",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">Projects</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Your API testing projects.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ New Project</Button>
      </div>

      {/* Search */}
      <div className="mt-6">
        <input
          type="search"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full max-w-xs rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      {/* Body */}
      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {loading ? (
          <div className="flex items-center justify-center py-16">
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
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-zinc-400">
              {projects && projects.length === 0
                ? "No projects yet — create your first."
                : "No projects match your search."}
            </p>
            {projects && projects.length === 0 && (
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                + New Project
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Members</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="w-10 px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const owner = isOwner(p);
                const roleLabel = owner ? "Owner" : p.role;
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    className="cursor-pointer border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-zinc-100">{p.name}</div>
                      {p.description && (
                        <div className="mt-0.5 max-w-md truncate text-xs text-zinc-500">
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-400">{p.memberCount}</td>
                    <td className="px-5 py-3">
                      <Badge tone={roleTone(roleLabel)}>{roleLabel}</Badge>
                    </td>
                    <td className="px-5 py-3 text-zinc-400">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DropdownMenu
                        items={[
                          {
                            label: "Open",
                            onClick: () => router.push(`/projects/${p.id}`),
                          },
                          ...(owner
                            ? [
                                {
                                  label: "Edit",
                                  onClick: () => setEditTarget(p),
                                },
                                {
                                  label: "Delete",
                                  danger: true,
                                  onClick: () => setDeleteTarget(p),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create */}
      {createOpen && (
        <ProjectFormModal
          open
          onClose={() => setCreateOpen(false)}
          onSaved={(project) => {
            setCreateOpen(false);
            router.push(`/projects/${project.id}`);
          }}
        />
      )}

      {/* Edit */}
      {editTarget && (
        <ProjectFormModal
          open
          project={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            reload();
          }}
        />
      )}

      {/* Delete */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete project"
        message={
          <>
            Delete <span className="font-medium text-zinc-100">
              {deleteTarget?.name}
            </span>
            ? This permanently removes the project and all its data.
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

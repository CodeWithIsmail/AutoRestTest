"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { ProjectContext } from "@/components/projects/project-context";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { deleteProject, getProject } from "@/lib/projects";
import { useApi } from "@/lib/useApi";

// Tabs grow as later slices add sections (Spec, Endpoints, Test Suites, Team).
const TABS = [{ label: "Overview", segment: "" }];

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const {
    data: project,
    loading,
    error,
    reload,
  } = useApi(() => getProject(id), [id]);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6 text-emerald-500" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-sm text-red-400">{error ?? "Project not found."}</p>
        <Link
          href="/projects"
          className="mt-3 inline-block text-sm font-medium text-emerald-500 hover:text-emerald-400"
        >
          ← Back to projects
        </Link>
      </div>
    );
  }

  const isOwner = project.ownerId === user?.id;
  const base = `/projects/${project.id}`;

  async function onConfirmDelete() {
    setDeleting(true);
    try {
      await deleteProject(id);
      toast.success("Project deleted.");
      router.push("/projects");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to delete project",
      );
      setDeleting(false);
    }
  }

  return (
    <ProjectContext.Provider value={{ project, isOwner, reload }}>
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-zinc-500">
          <Link href="/projects" className="hover:text-zinc-300">
            Projects
          </Link>
          <span className="px-2">›</span>
          <span className="text-zinc-300">{project.name}</span>
        </nav>

        {/* Header */}
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Owned by {project.owner.username}
            </p>
          </div>
          {isOwner && (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                Edit
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

        {/* Tab nav */}
        <div className="mt-5 border-b border-zinc-800">
          <div className="flex gap-6">
            {TABS.map((tab) => {
              const href = `${base}${tab.segment ? `/${tab.segment}` : ""}`;
              const active = pathname === href;
              return (
                <Link
                  key={tab.label}
                  href={href}
                  className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                    active
                      ? "border-emerald-500 text-emerald-400"
                      : "border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-6">{children}</div>
      </div>

      {/* Edit */}
      {editOpen && (
        <ProjectFormModal
          open
          project={project}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            reload();
          }}
        />
      )}

      {/* Delete */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete project"
        message={
          <>
            Delete{" "}
            <span className="font-medium text-zinc-100">{project.name}</span>?
            This permanently removes the project and all its data.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={onConfirmDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </ProjectContext.Provider>
  );
}

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
import { errMsg } from "@/lib/api";
import { deleteProject } from "@/lib/projects";
import { projectOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const TABS = [
  { label: "Overview", segment: "" },
  { label: "API Spec", segment: "spec" },
  { label: "Endpoints", segment: "endpoints" },
  { label: "Dependencies", segment: "graph" },
  { label: "Test Suites", segment: "test-suites" },
  { label: "Team", segment: "team" },
];

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

  const queryClient = useQueryClient();
  const {
    data: project,
    isPending,
    error,
    refetch,
  } = useQuery(projectOptions(id));

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => {
      toast.success("Project deleted.");
      // Drop this project's whole subtree, then refresh the list it was on.
      queryClient.removeQueries({ queryKey: qk.projects.detail(id) });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
      router.push("/projects");
    },
    onError: (err) => {
      toast.error(errMsg(err, "Failed to delete project"));
    },
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">
          {errMsg(error, "Project not found.")}
        </p>
        <Link
          href="/projects"
          className="mt-3 inline-block text-sm font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          ← Back to projects
        </Link>
      </div>
    );
  }

  const isOwner = project.ownerId === user?.id;
  const myRole = project.members.find((m) => m.userId === user?.id)?.role;
  // Owner or admin can manage project content (spec, endpoints).
  const canManage = isOwner || myRole === "admin";
  // Owner, admin, or tester can configure and trigger test runs.
  const canRun = canManage || myRole === "tester";
  const base = `/projects/${project.id}`;

  return (
    <ProjectContext.Provider
      value={{ project, isOwner, canManage, canRun, reload: refetch }}
    >
      {/* Wider than the 5xl the rest of the app uses: with the sidebar gone,
          this is where the reclaimed width actually pays off — the dependency
          graph canvas and the request-log tables are the widest things here. */}
      <div className="mx-auto max-w-7xl">
        {/* No breadcrumb: the top bar's project switcher already names the
            project and carries the way back out to the list. */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
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
        <div className="mt-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex gap-6">
            {TABS.map((tab) => {
              const href = `${base}${tab.segment ? `/${tab.segment}` : ""}`;
              // Overview matches exactly; other tabs also match their sub-routes
              // (e.g. a suite detail keeps the "Test Suites" tab highlighted).
              const active = tab.segment
                ? pathname === href || pathname.startsWith(`${href}/`)
                : pathname === href;
              return (
                <Link
                  key={tab.label}
                  href={href}
                  className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                    active
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                      : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
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
            void refetch();
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
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{project.name}</span>?
            This permanently removes the project and all its data.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setDeleteOpen(false)}
      />
    </ProjectContext.Provider>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import {
  ProjectCard,
  ProjectStatusBadges,
  effectiveRole,
  formatDate,
  formatRelative,
  roleLabel,
} from "@/components/projects/ProjectCard";
import { Badge, roleTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu, type MenuItem } from "@/components/ui/DropdownMenu";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { errMsg } from "@/lib/api";
import { deleteProject } from "@/lib/projects";
import { projectOptions, projectsOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import type { ProjectListItem, Role } from "@/lib/types";

const VIEW_KEY = "autoresttest-projects-view";

type SortKey = "name" | "memberCount" | "role" | "lastActivityAt";
type RoleFilter = "all" | "owner" | Role;
type ViewMode = "table" | "cards";

const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "tester", label: "Tester" },
  { value: "viewer", label: "Viewer" },
];

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "memberCount", label: "Members" },
  { key: "role", label: "Role" },
  { key: "lastActivityAt", label: "Last activity" },
];

function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 10.5h18M3 15.5h18" />
    </svg>
  );
}

function CardsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

/** Bordered icon-button pair for switching the projects list rendering
 *  (table vs. cards) — a mode switch, not navigation, so it's styled as a
 *  compact toggle rather than reusing the underline `SegmentedControl` tabs
 *  used for actual page navigation elsewhere. */
function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const options: { value: ViewMode; label: string; Icon: typeof TableIcon }[] = [
    { value: "table", label: "Table view", Icon: TableIcon },
    { value: "cards", label: "Cards view", Icon: CardsIcon },
  ];

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-0.5">
      {options.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-label={label}
          aria-pressed={value === v}
          title={label}
          className={`rounded p-1.5 transition-colors ${
            value === v
              ? "bg-emerald-600 text-white"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: projects, isPending, error } = useQuery(projectsOptions());

  // Warm a project's detail cache on hover, so the click that follows lands on
  // data that has already arrived instead of starting the round trip.
  const prefetchProject = useCallback(
    (projectId: string) => {
      void queryClient.prefetchQuery(projectOptions(projectId));
    },
    [queryClient],
  );

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(
    null,
  );

  const deleteMutation = useMutation({
    mutationFn: (project: ProjectListItem) => deleteProject(project.id),
    onSuccess: (_result, project) => {
      toast.success("Project deleted.");
      setDeleteTarget(null);
      queryClient.removeQueries({ queryKey: qk.projects.detail(project.id) });
      void queryClient.invalidateQueries({ queryKey: qk.projects.list() });
    },
    onError: (err) => {
      toast.error(errMsg(err, "Failed to delete project"));
    },
  });

  const visible = useMemo(() => {
    if (!projects) return [];
    const q = search.trim().toLowerCase();

    const rows = projects.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q);
      const matchesRole =
        roleFilter === "all" || effectiveRole(p, user?.id) === roleFilter;
      return matchesSearch && matchesRole;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "memberCount":
          return (a.memberCount - b.memberCount) * dir;
        case "role":
          return (
            effectiveRole(a, user?.id).localeCompare(
              effectiveRole(b, user?.id),
            ) * dir
          );
        case "lastActivityAt":
          return (a.lastActivityAt < b.lastActivityAt ? -1 : 1) * dir;
      }
    });
  }, [projects, search, roleFilter, sortKey, sortDir, user?.id]);

  function changeView(v: ViewMode) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Storage may be unavailable (private browsing); the toggle still
      // works for the rest of the session.
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function menuItemsFor(p: ProjectListItem): MenuItem[] {
    const owner = p.ownerId === user?.id;
    return [
      { label: "Open", onClick: () => router.push(`/projects/${p.id}`) },
      ...(owner
        ? [
            { label: "Edit", onClick: () => setEditTarget(p) },
            {
              label: "Delete",
              danger: true,
              onClick: () => setDeleteTarget(p),
            },
          ]
        : []),
    ];
  }

  const isEmpty = projects && projects.length === 0;
  const noMatches = Boolean(projects) && !isEmpty && visible.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Projects</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Your API testing projects.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ New Project</Button>
      </div>

      {/* Filters + view toggle */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-56 shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <Select
            value={roleFilter}
            onChange={(v) => setRoleFilter(v as RoleFilter)}
            aria-label="Filter by role"
            className="shrink-0"
            options={ROLE_FILTER_OPTIONS}
          />
        </div>

        <ViewToggle value={view} onChange={changeView} />
      </div>

      {/* Body */}
      {isPending ? (
        <div className="mt-4 flex items-center justify-center overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-16">
          <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
        </div>
      ) : error ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-12 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            {errMsg(error, "Failed to load projects")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: qk.projects.list() })
            }
          >
            Retry
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-20 text-center">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            No projects yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
            Create a project, then upload an OpenAPI spec or generate one
            from your source code to get started.
          </p>
          <Button className="mt-5" onClick={() => setCreateOpen(true)}>
            + New Project
          </Button>
        </div>
      ) : noMatches ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-16 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No projects match your search and filters.
          </p>
        </div>
      ) : view === "cards" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              currentUserId={user?.id}
              onOpen={() => router.push(`/projects/${p.id}`)}
              onPrefetch={() => prefetchProject(p.id)}
              menuItems={menuItemsFor(p)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                {SORT_COLUMNS.map((col) => (
                  <th key={col.key} className="px-5 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span aria-hidden>
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="w-10 px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const role = effectiveRole(p, user?.id);
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    onMouseEnter={() => prefetchProject(p.id)}
                    className="cursor-pointer border-b border-zinc-200 dark:border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-100 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</div>
                      {p.description && (
                        <div className="mt-0.5 max-w-md truncate text-xs text-zinc-500">
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">{p.memberCount}</td>
                    <td className="px-5 py-3">
                      <Badge tone={roleTone(role)}>{roleLabel(role)}</Badge>
                    </td>
                    <td
                      className="px-5 py-3 text-zinc-600 dark:text-zinc-400"
                      title={formatDate(p.lastActivityAt)}
                    >
                      {formatRelative(p.lastActivityAt)}
                    </td>
                    <td className="px-5 py-3">
                      <ProjectStatusBadges project={p} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DropdownMenu items={menuItemsFor(p)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
          onSaved={() => setEditTarget(null)}
        />
      )}

      {/* Delete */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete project"
        message={
          <>
            Delete <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {deleteTarget?.name}
            </span>
            ? This permanently removes the project and all its data.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

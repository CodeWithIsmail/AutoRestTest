"use client";

import { Badge, StatusBadge, roleTone, type Tone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DropdownMenu, type MenuItem } from "@/components/ui/DropdownMenu";
import type { ProjectListItem } from "@/lib/types";

/** "Owner" is a derived label (via `ownerId`), not a value of the `Role` enum. */
export function effectiveRole(
  project: ProjectListItem,
  userId: string | undefined,
): string {
  return project.ownerId === userId ? "owner" : project.role;
}

/** Display text for a role value from `effectiveRole` — "owner" reads as "Owner"; other roles stay as-is. */
export function roleLabel(role: string): string {
  return role === "owner" ? "Owner" : role;
}

const SPEC_BADGE: Record<
  ProjectListItem["specStatus"],
  { label: string; tone: Tone }
> = {
  none: { label: "No spec", tone: "zinc" },
  uploaded: { label: "Spec uploaded", tone: "blue" },
  generated: { label: "Spec generated", tone: "purple" },
};

const GENERATION_BADGE: Record<
  NonNullable<ProjectListItem["generationStatus"]>,
  { label: string; tone: Tone }
> = {
  pending: { label: "Generating…", tone: "blue" },
  running: { label: "Generating…", tone: "blue" },
  completed: { label: "Awaiting review", tone: "amber" },
  failed: { label: "Generation failed", tone: "red" },
};

/** Spec state + in-flight generation + latest run, stacked. Shared by the
 *  table and card views so the two stay in sync. */
export function ProjectStatusBadges({ project }: { project: ProjectListItem }) {
  const spec = SPEC_BADGE[project.specStatus];
  const generation = project.generationStatus
    ? GENERATION_BADGE[project.generationStatus]
    : null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge tone={spec.tone}>{spec.label}</Badge>
      {generation && <Badge tone={generation.tone}>{generation.label}</Badge>}
      {project.lastRun && (
        <span className="inline-flex items-center gap-1">
          <span className="text-xs text-zinc-500">Run:</span>
          <StatusBadge status={project.lastRun.status} />
        </span>
      )}
    </div>
  );
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

/** "2 hours ago" / "3 days ago"; falls back to a short absolute date past a month. */
export function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= unitMs || unit === "minute") {
      return relativeFormatter.format(Math.round(diffMs / unitMs), unit);
    }
  }
  return relativeFormatter.format(0, "minute");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface ProjectCardProps {
  project: ProjectListItem;
  currentUserId: string | undefined;
  onOpen: () => void;
  menuItems: MenuItem[];
}

export function ProjectCard({
  project,
  currentUserId,
  onOpen,
  menuItems,
}: ProjectCardProps) {
  const role = effectiveRole(project, currentUserId);

  return (
    <Card className="relative flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
      <div onClick={onOpen} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2 pr-8">
          <div className="min-w-0">
            <div className="font-medium text-zinc-900 dark:text-zinc-100">
              {project.name}
            </div>
            {project.description && (
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                {project.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <Badge tone={roleTone(role)}>{roleLabel(role)}</Badge>
          <span>
            {project.memberCount}{" "}
            {project.memberCount === 1 ? "member" : "members"}
          </span>
        </div>

        <ProjectStatusBadges project={project} />

        <div
          className="text-xs text-zinc-500"
          title={formatDate(project.lastActivityAt)}
        >
          Active {formatRelative(project.lastActivityAt)}
        </div>
      </div>

      <div className="absolute right-3 top-3">
        <DropdownMenu items={menuItems} />
      </div>
    </Card>
  );
}

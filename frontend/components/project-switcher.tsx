"use client";

import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu, type MenuItem } from "@/components/ui/DropdownMenu";
import { projectsOptions } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";

/** Pull the project id out of /projects/<id>/... , or null elsewhere. */
export function currentProjectId(pathname: string): string | null {
  const match = /^\/projects\/([^/]+)/.exec(pathname);
  return match ? match[1] : null;
}

/**
 * Project switcher for the top bar, shown only while inside a project.
 *
 * This replaced a sidebar whose "Projects" link meant "go back to the list so I
 * can pick a different one" — two clicks. Switching is the actual intent, so it
 * is now one, and the 240px column the sidebar occupied goes to the content
 * (the dependency graph and the request tables both want it).
 *
 * The shell cannot read ProjectContext — that lives a level down, inside
 * /projects/[id] — so the current project is resolved from the URL against the
 * list this component already needs for its menu, rather than by hoisting the
 * context up and rewiring every consumer.
 */
export function ProjectSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const projectId = currentProjectId(pathname);

  // Shares one cache entry with the projects page and the settings danger
  // zone, so mounting this in the shell costs no request of its own — it used
  // to re-fetch the whole list every time the current project changed.
  const { data: projects } = useQuery(projectsOptions());

  if (!projectId) return null;

  const current = projects?.find((p) => p.id === projectId);
  // Until the list arrives there is no name to show. Rendering a placeholder
  // that then swaps to the real name reads as a glitch, so show nothing.
  if (!current) return null;

  const items: MenuItem[] = (projects ?? []).map((p) => ({
    label: p.name,
    active: p.id === projectId,
    onClick: () => router.push(`/projects/${p.id}`),
  }));

  items.push({
    label: "All projects",
    separated: true,
    onClick: () => router.push("/projects"),
  });

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-zinc-400 dark:text-zinc-600" aria-hidden>
        /
      </span>
      <DropdownMenu
        label="Switch project"
        align="left"
        menuClassName="w-64"
        triggerClassName="flex items-center gap-1.5 px-2 py-1 max-w-[16rem]"
        items={items}
        trigger={
          <>
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {current.name}
            </span>
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        }
      />
    </div>
  );
}

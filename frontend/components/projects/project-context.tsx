"use client";

import { createContext, useContext } from "react";
import type { ProjectDetail } from "@/lib/types";

interface ProjectContextValue {
  project: ProjectDetail;
  /** Whether the current user owns this project (can edit/delete it). */
  isOwner: boolean;
  /**
   * Whether the current user can manage project content (spec, endpoints):
   * true for the owner or any admin member.
   */
  canManage: boolean;
  /**
   * Whether the current user can configure and trigger test runs:
   * true for the owner, admins, or testers.
   */
  canRun: boolean;
  /** Refetch the project (e.g. after an edit or membership change). */
  reload: () => void;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

/** Access the project loaded by the [id] layout. Use inside a project tab. */
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProject must be used within a project layout");
  }
  return ctx;
}

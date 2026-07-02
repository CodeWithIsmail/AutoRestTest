"use client";

import { createContext, useContext } from "react";
import type { ProjectDetail } from "@/lib/types";

interface ProjectContextValue {
  project: ProjectDetail;
  /** Whether the current user owns this project (can edit/delete). */
  isOwner: boolean;
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

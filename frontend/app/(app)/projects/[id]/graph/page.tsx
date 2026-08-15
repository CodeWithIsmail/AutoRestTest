"use client";

import { useEffect, useState } from "react";
import { DependencyGraphView } from "@/components/graph/DependencyGraphView";
import { useProject } from "@/components/projects/project-context";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { buildProjectGraph, getProjectGraph } from "@/lib/graph";
import type { GraphState } from "@/lib/types";

const POLL_MS = 3000;

export default function ProjectGraphPage() {
  const { project, canRun } = useProject();
  const toast = useToast();

  const [state, setState] = useState<GraphState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const next = await getProjectGraph(project.id);
        if (active) {
          setState(next);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError ? err.message : "Failed to load the graph",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [project.id]);

  // Narrowed so the interval isn't torn down and rebuilt on every tick.
  const status = state?.status;
  useEffect(() => {
    if (status !== "running") return;
    let active = true;
    const iv = setInterval(async () => {
      try {
        const next = await getProjectGraph(project.id);
        if (active) setState(next);
      } catch {
        // Transient poll errors are ignored; the next tick retries.
      }
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [status, project.id]);

  async function onBuild() {
    setBuilding(true);
    try {
      setState(await buildProjectGraph(project.id));
      toast.success("Building the dependency graph…");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not start the build",
      );
    } finally {
      setBuilding(false);
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-50">
            Dependency graph
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            How the engine thinks your operations relate: an edge means one
            operation produces a value another one needs. Built from the
            specification by matching field names semantically — no requests are
            sent to your API.
          </p>
        </div>
        {canRun && state?.status === "ready" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onBuild}
            loading={building}
          >
            Rebuild
          </Button>
        )}
      </div>

      {state?.status === "running" ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Spinner className="h-6 w-6 text-emerald-500" />
          <p className="text-sm text-zinc-300">Building the dependency graph…</p>
          <p className="max-w-md text-xs text-zinc-500">
            The engine is loading its word-embedding model and comparing every
            operation against every other. This takes a minute or so and does
            not call an LLM.
          </p>
        </Card>
      ) : state?.status === "failed" ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-red-400">
            {state.error ?? "The graph build failed."}
          </p>
          {canRun && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={onBuild}
              loading={building}
            >
              Try again
            </Button>
          )}
        </Card>
      ) : state?.status === "ready" && state.graph ? (
        <DependencyGraphView graph={state.graph} />
      ) : (
        <Card className="p-10 text-center">
          <p className="text-sm text-zinc-400">
            No dependency graph yet.
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
            Build one to see which operations depend on each other before you
            run any tests.
          </p>
          {canRun ? (
            <Button className="mt-4" onClick={onBuild} loading={building}>
              Build dependency graph
            </Button>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">
              Ask a project admin or tester to build it.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

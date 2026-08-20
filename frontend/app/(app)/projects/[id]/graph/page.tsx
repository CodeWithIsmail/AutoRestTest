"use client";

import { DependencyGraphView } from "@/components/graph/DependencyGraphView";
import { useProject } from "@/components/projects/project-context";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { errMsg } from "@/lib/api";
import { buildProjectGraph } from "@/lib/graph";
import { projectGraphOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export default function ProjectGraphPage() {
  const { project, canRun } = useProject();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Polling while a build is running is the query's own `refetchInterval` now;
  // it also stops on its own once the tab is hidden.
  const { data: state, isPending, error } = useQuery(
    projectGraphOptions(project.id),
  );

  const buildMutation = useMutation({
    mutationFn: () => buildProjectGraph(project.id),
    onSuccess: (next) => {
      // Seeding the cache flips status to "running", which is what starts the
      // poll — no separate trigger needed.
      queryClient.setQueryData(qk.projects.graph(project.id), next);
      toast.success("Building the dependency graph…");
    },
    onError: (err) => toast.error(errMsg(err, "Could not start the build")),
  });

  const onBuild = () => buildMutation.mutate();
  const building = buildMutation.isPending;

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">
          {errMsg(error, "Failed to load the graph")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Dependency graph
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
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
          <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Building the dependency graph…</p>
          <p className="max-w-md text-xs text-zinc-500">
            The engine is loading its word-embedding model and comparing every
            operation against every other. This takes a minute or so and does
            not call an LLM.
          </p>
        </Card>
      ) : state?.status === "failed" ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
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

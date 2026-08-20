"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useProject } from "@/components/projects/project-context";
import { AddEndpointModal } from "@/components/projects/AddEndpointModal";
import { EndpointDetailPanel } from "@/components/projects/EndpointDetailPanel";
import { useToast } from "@/components/toast";
import { Badge, MethodBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Spinner } from "@/components/ui/Spinner";
import { errMsg } from "@/lib/api";
import { deleteEndpoint } from "@/lib/endpoints";
import { endpointsOptions, specOptions } from "@/lib/queries";
import { qk } from "@/lib/query-keys";
import {
  getOperationDetail,
  parseSpec,
  type OperationDetail,
} from "@/lib/spec-parse";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EndpointItem } from "@/lib/types";

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function EndpointsPage() {
  const { project, canManage } = useProject();
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    data: endpoints,
    isPending,
    error,
  } = useQuery(endpointsOptions(project.id));

  // The spec supplies per-operation detail (params, body, auth, responses).
  // Parsed once; each endpoint is matched to its operation by method + path.
  // Shares its cache entry with the Spec tab, so switching between the two no
  // longer re-downloads the document.
  const { data: spec } = useQuery(specOptions(project.id));
  const specDoc = useMemo(
    () => (spec?.fileContent ? parseSpec(spec.fileContent) : null),
    [spec],
  );
  const detailById = useMemo(() => {
    const map = new Map<string, OperationDetail | null>();
    if (endpoints) {
      for (const e of endpoints) {
        map.set(
          e.id,
          specDoc ? getOperationDetail(specDoc, e.method, e.path) : null,
        );
      }
    }
    return map;
  }, [endpoints, specDoc]);

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EndpointItem | null>(null);

  const filtered = useMemo(() => {
    if (!endpoints) return [];
    const q = search.trim().toLowerCase();
    if (!q) return endpoints;
    return endpoints.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q),
    );
  }, [endpoints, search]);

  // Optimistic: the row disappears on click and comes back if the server says
  // no. Deleting one endpoint out of a list is safe to show before it is
  // confirmed — nothing else on the page is derived from it.
  const deleteMutation = useMutation({
    mutationFn: (endpoint: EndpointItem) =>
      deleteEndpoint(project.id, endpoint.id),
    onMutate: async (endpoint) => {
      const key = qk.projects.endpoints(project.id);
      // Stop any in-flight refetch from landing on top of the edit below.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<EndpointItem[]>(key);
      queryClient.setQueryData<EndpointItem[]>(key, (current) =>
        (current ?? []).filter((e) => e.id !== endpoint.id),
      );
      setDeleteTarget(null);
      return { previous, key };
    },
    onSuccess: () => toast.success("Endpoint deleted."),
    onError: (err, _endpoint, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      toast.error(errMsg(err, "Delete failed"));
    },
    onSettled: (_data, _err, _endpoint, context) => {
      if (context) {
        void queryClient.invalidateQueries({ queryKey: context.key });
      }
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <input
          type="search"
          placeholder="Search endpoints…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full max-w-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
        {canManage && (
          <Button onClick={() => setAddOpen(true)}>+ Add endpoint</Button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {isPending ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">
              {errMsg(error, "Failed to load endpoints")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: qk.projects.endpoints(project.id),
                })
              }
            >
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {endpoints && endpoints.length === 0 ? (
                <>
                  No endpoints yet — upload an API spec to auto-extract them, or
                  add one manually.
                </>
              ) : (
                "No endpoints match your search."
              )}
            </p>
            {endpoints && endpoints.length === 0 && (
              <Link
                href={`/projects/${project.id}/spec`}
                className="mt-3 inline-block text-sm font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                Go to API Spec →
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                <th className="w-8 px-2 py-3" />
                <th className="px-5 py-3 font-medium">Method</th>
                <th className="px-5 py-3 font-medium">Path</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Source</th>
                {canManage && <th className="w-10 px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const detail = detailById.get(e.id) ?? null;
                const expanded = expandedId === e.id;
                const colSpan = canManage ? 6 : 5;
                return (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() =>
                        setExpandedId(expanded ? null : e.id)
                      }
                      className="cursor-pointer border-b border-zinc-200 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-100 dark:hover:bg-zinc-800/30"
                    >
                      <td className="px-2 py-3 text-center">
                        <Chevron
                          className={`inline h-4 w-4 text-zinc-500 transition-transform ${
                            expanded ? "rotate-90" : ""
                          }`}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <MethodBadge method={e.method} />
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex flex-wrap items-center gap-2 font-mono text-zinc-800 dark:text-zinc-200">
                          {e.path}
                          {detail?.auth.required && (
                            <Badge tone="amber">🔒 Auth</Badge>
                          )}
                          {detail && detail.parameters.length > 0 && (
                            <span className="font-sans text-xs text-zinc-500">
                              {detail.parameters.length} param
                              {detail.parameters.length === 1 ? "" : "s"}
                            </span>
                          )}
                          {detail?.requestBody && (
                            <span className="font-sans text-xs text-zinc-500">
                              body
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="max-w-md px-5 py-3">
                        <span className="line-clamp-1 text-zinc-600 dark:text-zinc-400">
                          {e.description || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={e.addedManually ? "zinc" : "emerald"}>
                          {e.addedManually ? "Manual" : "From spec"}
                        </Badge>
                      </td>
                      {canManage && (
                        <td
                          className="px-5 py-3 text-right"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <DropdownMenu
                            items={[
                              {
                                label: "Delete",
                                danger: true,
                                onClick: () => setDeleteTarget(e),
                              },
                            ]}
                          />
                        </td>
                      )}
                    </tr>
                    {expanded && (
                      <tr className="border-b border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/40">
                        <td colSpan={colSpan} className="px-5 py-5">
                          {detail ? (
                            <EndpointDetailPanel detail={detail} />
                          ) : (
                            <p className="text-sm text-zinc-500">
                              No spec detail available for this endpoint
                              {e.addedManually
                                ? " (added manually)."
                                : spec
                                  ? "."
                                  : " — upload an API spec to see parameters, request body, and auth."}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && (
        <AddEndpointModal
          projectId={project.id}
          onClose={() => setAddOpen(false)}
          onSaved={() => setAddOpen(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete endpoint"
        message={
          <>
            Delete{" "}
            <span className="font-mono text-zinc-900 dark:text-zinc-100">
              {deleteTarget?.method} {deleteTarget?.path}
            </span>
            ?
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

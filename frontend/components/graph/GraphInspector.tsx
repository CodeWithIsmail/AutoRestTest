"use client";

import Link from "next/link";
import { Badge, MethodBadge } from "@/components/ui/Badge";
import type { DependencyGraph, GraphEdge, GraphMatch } from "@/lib/types";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
        {count !== undefined && (
          <span className="font-mono text-zinc-400 dark:text-zinc-600">{count}</span>
        )}
      </p>
      {children}
    </div>
  );
}

const KIND_TONE = {
  confirmed: "emerald",
  discovered: "emerald",
  penalized: "amber",
  predicted: "zinc",
} as const;

const KIND_LABEL = {
  confirmed: "confirmed",
  discovered: "discovered",
  penalized: "penalized",
  predicted: "predicted",
} as const;

function MatchRow({ match }: { match: GraphMatch }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 text-xs">
      <span className="font-mono text-zinc-800 dark:text-zinc-200">{match.param}</span>
      <span className="text-zinc-400 dark:text-zinc-600">←</span>
      <span className="font-mono text-zinc-700 dark:text-zinc-300">{match.producedBy}</span>
      <span className="text-zinc-400 dark:text-zinc-600">({match.producedIn})</span>
      <span className="ml-auto flex gap-2 font-mono text-zinc-500">
        {match.similarity !== null && <span>sim {match.similarity.toFixed(2)}</span>}
        {match.q !== null && (
          <span className={match.q > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
            q {match.q.toFixed(2)}
          </span>
        )}
      </span>
    </li>
  );
}

/** One dependency, as it appears in a node's Needs/Provides list. */
function EdgeRow({
  edge,
  otherId,
  onSelect,
}: {
  edge: GraphEdge;
  otherId: string;
  onSelect: (id: string) => void;
}) {
  const top = edge.matches[0];
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(otherId)}
        className="flex w-full flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
      >
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{otherId}</span>
        {top && (
          <span className="font-mono text-zinc-500">
            {top.param} ← {top.producedBy}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {edge.maxQ !== null && (
            <span
              className={`font-mono ${edge.maxQ > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
            >
              {edge.maxQ.toFixed(2)}
            </span>
          )}
          <Badge tone={KIND_TONE[edge.kind]}>{KIND_LABEL[edge.kind]}</Badge>
        </span>
      </button>
    </li>
  );
}

export interface GraphInspectorProps {
  graph: DependencyGraph;
  selectedId: string | null;
  selectedEdge: GraphEdge | null;
  onSelectNode: (id: string | null) => void;
  onClose: () => void;
  /** Present on the run view: links through to that endpoint's captured requests. */
  requestsHref?: (operationId: string) => string | null;
}

export function GraphInspector({
  graph,
  selectedId,
  selectedEdge,
  onSelectNode,
  onClose,
  requestsHref,
}: GraphInspectorProps) {
  if (selectedEdge) {
    return (
      <Panel
        title={`${selectedEdge.from} → ${selectedEdge.to}`}
        subtitle="Dependency"
        onClose={onClose}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={KIND_TONE[selectedEdge.kind]}>
            {KIND_LABEL[selectedEdge.kind]}
          </Badge>
          {selectedEdge.tentative && <Badge tone="zinc">tentative</Badge>}
        </div>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{selectedEdge.to}</span>{" "}
          needs values that{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{selectedEdge.from}</span>{" "}
          supplies.
        </p>
        <Section title="Matched fields" count={selectedEdge.matches.length}>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
            {selectedEdge.matches.map((m, i) => (
              <MatchRow key={`${m.param}-${m.producedBy}-${i}`} match={m} />
            ))}
          </ul>
        </Section>
      </Panel>
    );
  }

  if (!selectedId) return null;

  const node = graph.nodes.find((n) => n.id === selectedId);
  if (!node) return null;

  // "Needs" = edges into this node (it is the consumer); "Provides" = edges out.
  const needs = graph.edges.filter((e) => e.to === node.id);
  const provides = graph.edges.filter((e) => e.from === node.id);
  const href = requestsHref?.(node.id) ?? null;

  return (
    <Panel
      title={node.id}
      subtitle={node.summary ?? undefined}
      onClose={onClose}
    >
      <div className="flex items-center gap-2">
        {node.method && <MethodBadge method={node.method} />}
        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{node.path}</span>
      </div>

      {node.statusCodes && (
        <Section title="This run">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(node.statusCodes).map(([code, n]) => (
              <span
                key={code}
                className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:text-zinc-300"
              >
                {code}×{n}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Needs" count={needs.length}>
        {needs.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Nothing — this operation can start a run.
          </p>
        ) : (
          <ul>
            {needs.map((e, i) => (
              <EdgeRow
                key={`${e.from}-${i}`}
                edge={e}
                otherId={e.from}
                onSelect={onSelectNode}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Provides" count={provides.length}>
        {provides.length === 0 ? (
          <p className="text-xs text-zinc-500">Nothing depends on this.</p>
        ) : (
          <ul>
            {provides.map((e, i) => (
              <EdgeRow
                key={`${e.to}-${i}`}
                edge={e}
                otherId={e.to}
                onSelect={onSelectNode}
              />
            ))}
          </ul>
        )}
      </Section>

      {href && (
        <Link
          href={href}
          className="text-xs font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          View captured requests →
        </Link>
      )}
    </Panel>
  );
}

function Panel({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex max-h-full w-80 flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/95 shadow-xl shadow-black/40 backdrop-blur">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-3">
        {children}
      </div>
    </div>
  );
}

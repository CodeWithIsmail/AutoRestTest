"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { OperationDetail } from "@/lib/spec-parse";

// Renders the parsed detail for one operation: auth, parameters, request body,
// and responses. Consumers pass `detail = null` for endpoints not found in the
// spec (e.g. manually-added) and render their own empty state.

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </p>
      {children}
    </div>
  );
}

const IN_TONE = {
  path: "purple",
  query: "blue",
  header: "amber",
  cookie: "zinc",
} as const;

export function EndpointDetailPanel({ detail }: { detail: OperationDetail }) {
  const [showExample, setShowExample] = useState(false);
  const { auth, parameters, requestBody, responses } = detail;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Auth */}
      <Section title="Authentication">
        {auth.required ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">🔒 Required</Badge>
            {auth.schemes.map((s) => (
              <Badge key={s} tone="zinc">
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <Badge tone="zinc">No auth required</Badge>
        )}
      </Section>

      {/* Parameters */}
      <Section title={`Parameters (${parameters.length})`}>
        {parameters.length === 0 ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {parameters.map((p) => (
              <li
                key={`${p.in}:${p.name}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-mono text-zinc-200">{p.name}</span>
                <Badge tone={IN_TONE[p.in as keyof typeof IN_TONE] ?? "zinc"}>
                  {p.in}
                </Badge>
                <span className="text-xs text-zinc-500">{p.type}</span>
                {p.required && (
                  <span className="text-xs font-medium text-red-400">
                    required
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Request body */}
      <Section title="Request body">
        {!requestBody ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {requestBody.contentTypes.map((ct) => (
                <Badge key={ct} tone="blue">
                  {ct}
                </Badge>
              ))}
              {requestBody.required && (
                <span className="text-xs font-medium text-red-400">
                  required
                </span>
              )}
            </div>
            {requestBody.props.length > 0 && (
              <ul className="flex flex-col gap-1">
                {requestBody.props.map((prop) => (
                  <li key={prop.name} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-zinc-200">{prop.name}</span>
                    <span className="text-xs text-zinc-500">{prop.type}</span>
                    {prop.required && (
                      <span className="text-xs font-medium text-red-400">
                        required
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {requestBody.example && (
              <div>
                <button
                  onClick={() => setShowExample((s) => !s)}
                  className="text-xs font-medium text-emerald-500 hover:text-emerald-400"
                >
                  {showExample ? "Hide example" : "Show example"}
                </button>
                {showExample && (
                  <pre className="mt-2 max-h-60 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
                    {requestBody.example}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Responses */}
      <Section title="Responses">
        {responses.length === 0 ? (
          <p className="text-sm text-zinc-500">None documented.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {responses.map((r) => (
              <li key={r.code} className="flex items-baseline gap-2 text-sm">
                <span className="font-mono font-medium text-zinc-200">
                  {r.code}
                </span>
                <span className="text-xs text-zinc-500">
                  {r.description || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { suiteHistoryOptions } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";
import type { TestSuiteSummary } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function entryLabel(s: TestSuiteSummary, index: number): string {
  if (s.name) return s.name;
  return s.runType === "replay" ? `Replay #${index}` : `Run ${s.id.slice(0, 8)}`;
}

/**
 * Every run of one suite's fixed request sequence: the original AI-generated
 * run plus every replay of it, oldest first. Lets the user compare a replay's
 * outcome against the baseline (and against earlier replays) instead of only
 * ever seeing the most recent attempt.
 */
export function RunHistoryPanel({
  projectId,
  suiteId,
  currentSuiteId,
  basePath,
}: {
  projectId: string;
  suiteId: string;
  currentSuiteId: string;
  basePath: string;
}) {
  const { data: history, isPending } = useQuery(
    suiteHistoryOptions(projectId, suiteId),
  );

  if (isPending) {
    return (
      <Card className="flex justify-center p-6">
        <Spinner className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
      </Card>
    );
  }

  if (!history || history.length < 2) {
    // Nothing to show yet — a lone original run isn't "history" until it has
    // at least one replay.
    return null;
  }

  let replayIndex = 0;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Run history
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          The original run and every replay of its captured request sequence.
        </p>
      </div>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {history.map((s) => {
          const isReplay = s.runType === "replay";
          if (isReplay) replayIndex += 1;
          const isCurrent = s.id === currentSuiteId;
          return (
            <li key={s.id}>
              <Link
                href={`${basePath}/${s.id}`}
                className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/40 ${
                  isCurrent ? "bg-emerald-500/5" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`font-medium ${
                      isCurrent
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    {entryLabel(s, replayIndex)}
                  </span>
                  <Badge tone={isReplay ? "purple" : "zinc"}>
                    {isReplay ? "Replay" : "Original"}
                  </Badge>
                  {isCurrent && <Badge tone="emerald">Viewing</Badge>}
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-xs text-zinc-500">
                    {s.status === "completed"
                      ? `${s.passedTestCases}/${s.totalTestCases} passed`
                      : "—"}
                  </span>
                  <StatusBadge status={s.status} />
                  <span className="text-xs text-zinc-500">
                    {formatDate(s.createdAt)}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

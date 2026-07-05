"use client";

import { useEffect, useState } from "react";
import type { SuiteStatus } from "@/lib/types";

// A vertical stepper for a run's lifecycle (Created → Started → Finished) with
// the computed gap between each stage. While a run is in progress it shows a
// live-ticking elapsed timer instead of a finish time.

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

interface Step {
  label: string;
  time: string | null;
  /** Sub-label under the timestamp, e.g. "queued 11s" / "ran 25m 2s". */
  note?: string;
  tone: "done" | "active" | "pending" | "failed";
}

const DOT: Record<Step["tone"], string> = {
  done: "bg-emerald-500 ring-emerald-500/20",
  active: "bg-blue-500 ring-blue-500/20 animate-pulse",
  pending: "bg-zinc-600 ring-zinc-600/20",
  failed: "bg-red-500 ring-red-500/20",
};

export function RunTimeline({
  status,
  createdAt,
  startedAt,
  completedAt,
}: {
  status: SuiteStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}) {
  // Tick once a second only while running, to drive the live elapsed timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "running") return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [status]);

  const created = new Date(createdAt).getTime();
  const started = startedAt ? new Date(startedAt).getTime() : null;
  const completed = completedAt ? new Date(completedAt).getTime() : null;

  const queued =
    started !== null ? formatDuration(started - created) : null;
  const ran =
    started !== null
      ? formatDuration((completed ?? now) - started)
      : null;

  const steps: Step[] = [
    {
      label: "Created",
      time: createdAt,
      tone: "done",
    },
    {
      label: "Started",
      time: startedAt,
      note: queued ? `queued ${queued}` : undefined,
      tone: started ? "done" : status === "failed" ? "failed" : "pending",
    },
    {
      label:
        status === "running"
          ? "Running"
          : status === "failed"
            ? "Failed"
            : "Finished",
      time: completedAt,
      note:
        status === "running" && ran
          ? `elapsed ${ran}`
          : completed && ran
            ? `ran ${ran}`
            : undefined,
      tone:
        status === "running"
          ? "active"
          : status === "failed"
            ? "failed"
            : completed
              ? "done"
              : "pending",
    },
  ];

  return (
    <ol className="relative flex flex-col gap-5">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex gap-3">
          {/* Connector line to the next step */}
          {i < steps.length - 1 && (
            <span
              className="absolute left-[5px] top-4 h-[calc(100%+4px)] w-px bg-zinc-800"
              aria-hidden
            />
          )}
          <span
            className={`mt-1 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ${DOT[step.tone]}`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">{step.label}</p>
            <p className="text-xs text-zinc-500">
              {step.time ? formatTime(step.time) : "—"}
              {step.note && (
                <span className="ml-2 text-zinc-400">· {step.note}</span>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

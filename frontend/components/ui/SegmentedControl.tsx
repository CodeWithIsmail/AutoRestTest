"use client";

interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * In-page tab switcher. Matches the underline styling of the route-based
 * project tabs in `app/(app)/projects/[id]/layout.tsx` so the two read as the
 * same control at different levels.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div className={`flex gap-6 border-b border-zinc-800 ${className}`}>
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            onClick={() => onChange(segment.value)}
            className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
              active
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

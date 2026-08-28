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
    // The scroller is the outer element so a long set of segments slides
    // sideways on a narrow screen instead of widening the page.
    <div className={`overflow-x-auto overflow-y-hidden ${className}`}>
      <div className="flex w-max min-w-full gap-5 border-b border-zinc-200 dark:border-zinc-800 sm:gap-6">
        {segments.map((segment) => {
          const active = segment.value === value;
          return (
            <button
              key={segment.value}
              type="button"
              onClick={() => onChange(segment.value)}
              className={`-mb-px whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                active
                  ? "border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-400"
                  : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {segment.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

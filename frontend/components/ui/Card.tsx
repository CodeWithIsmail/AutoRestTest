import type { HTMLAttributes } from "react";

/** Forwards the remaining div props so callers can attach handlers (e.g. a
 *  hover prefetch) without wrapping the card in another element. */
export function Card({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </div>
  );
}

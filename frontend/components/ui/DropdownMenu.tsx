"use client";

import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Marks the item the user is already on, e.g. the current project. */
  active?: boolean;
  /** Small count rendered on the right, e.g. pending invitations. */
  badge?: number;
  /** Draws a divider above this item, to group navigation from actions. */
  separated?: boolean;
}

export interface DropdownMenuProps {
  items: MenuItem[];
  /**
   * Contents of the button that opens the menu. Defaults to the kebab (⋮) glyph
   * every table row uses; the header passes an avatar instead.
   */
  trigger?: React.ReactNode;
  /** Accessible name for the trigger, since it is usually icon-only. */
  label?: string;
  /** Extra classes on the trigger button, e.g. to drop the icon padding. */
  triggerClassName?: string;
  /** Which edge the menu hangs from. Right suits a table row; left, a header. */
  align?: "left" | "right";
  /** Width override for the panel. The default suits short action labels. */
  menuClassName?: string;
}

/** A button that opens a small dropdown menu of actions. */
export function DropdownMenu({
  items,
  trigger,
  label = "Actions",
  triggerClassName = "p-1.5",
  align = "right",
  menuClassName = "w-40",
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 ${triggerClassName}`}
      >
        {trigger ?? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-lg shadow-black/40 ${
            align === "left" ? "left-0" : "right-0"
          } ${menuClassName}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 ${
                item.separated ? "mt-1 border-t border-zinc-800 pt-2.5" : ""
              } ${
                item.danger
                  ? "text-red-400"
                  : item.active
                    ? "text-emerald-400"
                    : "text-zinc-200"
              }`}
            >
              {/* Fixed-width gutter so labels line up whether or not the row
                  is the active one. */}
              {item.active !== undefined && (
                <span className="w-3.5 shrink-0 text-emerald-400" aria-hidden>
                  {item.active ? "✓" : ""}
                </span>
              )}
              <span className="flex-1 truncate" title={item.label}>
                {item.label}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

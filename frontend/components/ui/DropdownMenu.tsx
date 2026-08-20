"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

interface MenuPosition {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

// Below this much room, the panel opens upward instead of downward. Matches
// max-h-80 (320px) loosely — an exact measurement isn't needed since the
// panel scrolls internally if it's still taller than the flipped space.
const MIN_SPACE_BELOW = 200;

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
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Anchored via a portal to document.body with viewport (`fixed`) coordinates,
  // so the panel escapes any ancestor `overflow-hidden` table/card wrapper —
  // otherwise a row near the bottom of such a container clips the menu.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < MIN_SPACE_BELOW && spaceAbove > spaceBelow;

    setPosition({
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
      left: align === "left" ? rect.left : undefined,
      right: align === "left" ? undefined : window.innerWidth - rect.right,
    });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    // Closes rather than re-tracks position on scroll — simpler than
    // re-measuring, and scrolling mid-menu is a rare interaction anyway.
    // `capture: true` catches scrolls on any inner scrollable ancestor, not
    // just the window.
    function onScrollOrResize() {
      setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 ${triggerClassName}`}
      >
        {trigger ?? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
        )}
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={position}
            className={`fixed z-50 max-h-80 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40 ${menuClassName}`}
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
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  item.separated ? "mt-1 border-t border-zinc-200 pt-2.5 dark:border-zinc-800" : ""
                } ${
                  item.danger
                    ? "text-red-600 dark:text-red-400"
                    : item.active
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-800 dark:text-zinc-200"
                }`}
              >
                {/* Fixed-width gutter so labels line up whether or not the row
                    is the active one. */}
                {item.active !== undefined && (
                  <span className="w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
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
          </div>,
          document.body,
        )}
    </>
  );
}

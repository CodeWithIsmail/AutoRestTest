"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  "aria-label"?: string;
  id?: string;
  disabled?: boolean;
  /** Compact filter-bar sizing vs a form-field size. Defaults to "md". */
  size?: "sm" | "md";
  /** Extra classes on the trigger, e.g. a max-width for a long option list. */
  className?: string;
}

interface Position {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
}

// Below this much room, the panel opens upward instead of downward — mirrors
// DropdownMenu's flip threshold.
const MIN_SPACE_BELOW = 240;

function nextEnabledIndex(
  options: SelectOption[],
  from: number,
  dir: 1 | -1,
): number {
  if (options.length === 0) return -1;
  let i = from;
  for (let step = 0; step < options.length; step++) {
    i = (i + dir + options.length) % options.length;
    if (!options[i].disabled) return i;
  }
  return from;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-150 dark:text-zinc-400 ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Custom single-select listbox. Replaces the native <select>, whose open
 * dropdown is unstylable OS/browser chrome (square corners, default blue
 * highlight, no dark-mode awareness) — everything else about the trigger can
 * be themed, but not that panel.
 *
 * Positioned like DropdownMenu: portaled to document.body in viewport
 * coordinates so it escapes any `overflow-hidden` ancestor (a table wrapper,
 * a card), and flips upward when there isn't room below. Diverges from
 * DropdownMenu on one point on purpose: DropdownMenu closes on *any* scroll
 * because its lists are short, but a Select can hold dozens of options (every
 * endpoint in a run), so scrolling inside the panel must not dismiss it —
 * only scrolling the page (which would misalign the anchor) does.
 */
export function Select({
  value,
  onChange,
  options,
  id,
  disabled = false,
  size = "md",
  className = "",
  ...aria
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < MIN_SPACE_BELOW && spaceAbove > spaceBelow;
    setPosition({
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
      left: rect.left,
      minWidth: rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    // Scrolling *within* the panel must not close it — only scrolling
    // something outside it (which would leave the panel pointing at empty
    // space) does.
    function onScroll(e: Event) {
      if (listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function openMenu() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function commit(index: number) {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    if (opt.value !== value) onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        // Stops native propagation to window so an Escape that closes this
        // panel doesn't also close a parent Modal listening on window.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => nextEnabledIndex(options, i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => nextEnabledIndex(options, i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(nextEnabledIndex(options, -1, 1));
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(nextEnabledIndex(options, options.length, -1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const sizeClass =
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3 text-sm";

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        aria-label={aria["aria-label"]}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={onTriggerKeyDown}
        className={`inline-flex cursor-pointer items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white text-left font-medium text-zinc-900 shadow-sm transition-colors hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-600 ${sizeClass} ${className}`}
      >
        <span className="truncate">{selected?.label ?? "Select…"}</span>
        <ChevronIcon open={open} />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              top: position.top,
              bottom: position.bottom,
              left: position.left,
              minWidth: position.minWidth,
            }}
            className="z-50 max-h-72 max-w-[min(90vw,26rem)] overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40 dark:ring-white/5"
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIndex;
              return (
                <button
                  key={opt.value}
                  id={`${listboxId}-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => commit(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isActive && !opt.disabled ? "bg-zinc-100 dark:bg-zinc-800" : ""
                  } ${
                    isSelected
                      ? "font-medium text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  <span className="w-4 shrink-0" aria-hidden>
                    {isSelected && <CheckIcon className="h-4 w-4" />}
                  </span>
                  <span className="flex-1 truncate" title={opt.label}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

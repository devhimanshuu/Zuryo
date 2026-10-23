"use client";

import { Check, MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export type CoachMenuItem =
  | {
      kind: "action";
      label: string;
      icon: React.ReactNode;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
    }
  | { kind: "radio"; label: string; checked: boolean; onSelect: () => void }
  | { kind: "label"; label: string }
  | { kind: "separator" };

/**
 * A small overflow menu for the coach header. Opens beneath the button, closes on Escape, on an
 * outside press and after a choice. Escape is handled here so it does not also close the panel.
 */
export function CoachMenu({ items }: { items: CoachMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const entries = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "ArrowDown" ? (at + 1) % entries.length : (at - 1 + entries.length) % entries.length;
    entries[next]?.focus();
  }

  return (
    <div className="relative" onKeyDown={onKeyDown}>
      <Button
        ref={button}
        type="button"
        variant={open ? "secondary" : "ghost"}
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More coach options"
        title="More options"
        className="size-9"
      >
        <MoreVertical aria-hidden />
      </Button>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="Coach options"
          className="absolute top-full right-0 z-20 mt-1.5 w-56 animate-fade-in overflow-hidden rounded-lg border border-hairline bg-raised py-1 shadow-(--shadow-3)"
        >
          {items.map((item, i) => {
            if (item.kind === "separator") return <hr key={i} className="my-1 border-hairline" />;
            if (item.kind === "label") {
              return (
                <p
                  key={i}
                  className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-subtle uppercase"
                >
                  {item.label}
                </p>
              );
            }
            const common =
              "flex min-h-10 w-full items-center gap-2.5 px-3 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
            if (item.kind === "radio") {
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.checked}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  className={cn(common, "text-ink hover:bg-sunken")}
                >
                  <span className="grid size-4 place-items-center text-brand">
                    {item.checked ? <Check className="size-4" aria-hidden /> : null}
                  </span>
                  {item.label}
                </button>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  common,
                  item.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-sunken",
                )}
              >
                <span className="grid size-4 place-items-center" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

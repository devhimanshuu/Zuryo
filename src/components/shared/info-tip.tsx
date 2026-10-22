"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A small explanation trigger that works with hover, focus and touch. The tooltip is plain text in
 * the DOM only while open, so it never becomes a hidden focus stop.
 */
export function InfoTip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={`About: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className="grid size-5 shrink-0 place-items-center rounded-full text-ink-subtle hover:bg-sunken hover:text-ink"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-1.5 w-60 -translate-x-1/2 rounded-md border border-hairline bg-raised px-3 py-2 text-left text-body-sm font-normal text-ink shadow-(--shadow-2)"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

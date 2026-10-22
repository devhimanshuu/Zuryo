"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type StepDef<S extends string> = { id: S; label: string };

/**
 * Step progress. Completed steps are buttons so customers can go back and change a choice; later
 * steps are inert until reached.
 */
export function Stepper<S extends string>({
  steps,
  current,
  reachable,
  onSelect,
}: {
  steps: StepDef<S>[];
  current: S;
  reachable: (id: S) => boolean;
  onSelect: (id: S) => void;
}) {
  const currentIndex = steps.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Booking progress">
      <p className="mb-2 flex items-center justify-between gap-3 text-body-sm text-ink-muted">
        <span>
          Step {currentIndex + 1} of {steps.length}
          <span className="hidden sm:inline"> · </span>
          <span className="hidden font-semibold text-ink sm:inline">{steps[currentIndex]?.label}</span>
          <span className="font-semibold text-ink sm:hidden"> · {steps[currentIndex]?.label}</span>
        </span>
        <span className="tabular">{Math.round(((currentIndex + 1) / steps.length) * 100)}% complete</span>
      </p>
      <ol className="flex gap-1.5 sm:gap-2">
        {steps.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const canGo = !active && reachable(s.id);
          const content = (
            <>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular",
                  active && "bg-brand text-on-brand",
                  done && "bg-brand-soft text-brand",
                  !active && !done && "bg-sunken text-ink-subtle",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              <span className="hidden truncate sm:inline">{s.label}</span>
            </>
          );
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <div
                className={cn("mb-2 h-1 rounded-full", done || active ? "bg-brand" : "bg-sunken")}
                aria-hidden
              />
              {canGo ? (
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-sm text-left text-body-sm font-semibold text-ink-muted hover:text-ink"
                >
                  <span className="sr-only">Go back to step {i + 1}: </span>
                  {content}
                </button>
              ) : (
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-w-0 items-center gap-2 text-body-sm font-semibold",
                    active ? "text-ink" : "text-ink-subtle",
                  )}
                >
                  <span className="sr-only">
                    Step {i + 1}
                    {active ? " (current)" : ""}:{" "}
                  </span>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

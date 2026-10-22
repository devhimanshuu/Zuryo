"use client";

import { Check, ChevronRight, ListChecks, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

export type ChecklistStep = {
  id: string;
  title: string;
  body: string;
  href: string;
  done: boolean;
};

/**
 * A short, dismissible starter checklist. It disappears once every step is done, and the dismissal
 * is remembered per role and account in this browser.
 */
export function OnboardingChecklist({
  storageKey,
  title,
  description,
  steps,
  className,
}: {
  storageKey: string;
  title: string;
  description: string;
  steps: ChecklistStep[];
  className?: string;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "dismissed") setHidden(true);
    } catch {
      // Storage may be unavailable; the checklist simply stays visible.
    }
  }, [storageKey]);

  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  const percent = Math.round((done / steps.length) * 100);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(storageKey, "dismissed");
    } catch {
      // Ignore unavailable storage.
    }
  }

  return (
    <section
      aria-labelledby={`onboarding-${storageKey}`}
      className={cn("relative overflow-hidden rounded-lg border border-hairline bg-raised p-5 shadow-(--shadow-1) sm:p-6", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-soft text-brand" aria-hidden>
            <ListChecks className="size-5" />
          </span>
          <div>
            <h2 id={`onboarding-${storageKey}`} className="font-semibold">
              {title}
            </h2>
            <p className="mt-0.5 text-body-sm text-ink-muted">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="grid size-8 shrink-0 place-items-center rounded-sm text-ink-subtle hover:bg-sunken hover:text-ink"
          aria-label="Hide this checklist"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <p className="shrink-0 text-body-sm font-semibold tabular">
          {done} of {steps.length} done
        </p>
      </div>

      <ol className="mt-3 grid gap-1">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className="group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sunken"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  step.done ? "bg-brand text-on-brand" : "border border-control text-ink-muted",
                )}
                aria-hidden
              >
                {step.done ? <Check className="size-3" strokeWidth={2.5} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-body-sm font-semibold",
                    step.done ? "text-ink-muted" : "text-ink",
                  )}
                >
                  {step.title}
                  {step.done ? <span className="sr-only"> (done)</span> : null}
                </span>
                {!step.done ? (
                  <span className="mt-0.5 block text-body-sm text-ink-muted">{step.body}</span>
                ) : null}
              </span>
              {!step.done ? (
                <ChevronRight
                  className="mt-0.5 size-4 shrink-0 text-ink-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink"
                  aria-hidden
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

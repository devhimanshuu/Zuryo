"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { OperationsFilterBar, type FilterSelect } from "./filter-bar";

/**
 * Keeps the current results visible while a filtered navigation is in flight: a thin progress bar
 * and a polite live region signal the update, and the list is dimmed instead of blanked.
 */
export function OperationsFilterShell({
  children,
  searchPlaceholder,
  defaultQuery,
  selects,
  resultSummary,
}: {
  children: React.ReactNode;
  searchPlaceholder: string;
  defaultQuery?: string;
  selects?: FilterSelect[];
  resultSummary: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <div>
      <div className="mb-4">
        <OperationsFilterBar
          searchPlaceholder={searchPlaceholder}
          defaultQuery={defaultQuery}
          selects={selects}
          onPendingChange={setPending}
        />
      </div>
      <p role="status" className="sr-only">
        {pending ? "Updating results…" : resultSummary}
      </p>
      <div aria-busy={pending} className="relative">
        {pending ? (
          <div aria-hidden className="absolute inset-x-0 -top-1.5 h-0.5 overflow-hidden rounded-full bg-brand-soft">
            <div className="h-full w-1/4 animate-progress rounded-full bg-brand" />
          </div>
        ) : null}
        <div className={cn("transition-opacity duration-150", pending && "pointer-events-none opacity-55")}>
          {children}
        </div>
      </div>
    </div>
  );
}

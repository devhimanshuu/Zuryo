import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Native select styled like <Input>: keyboard, screen reader and mobile pickers work out of the box. */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-md border border-control bg-raised pr-9 pl-3 text-body-md text-ink",
          "focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </div>
  );
}

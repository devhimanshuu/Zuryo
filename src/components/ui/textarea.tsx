import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full min-w-0 rounded-md border border-control bg-raised px-3 py-2.5 text-body-md text-ink placeholder:text-ink-subtle",
        "focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

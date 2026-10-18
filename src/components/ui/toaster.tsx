"use client";

import { Toaster as Sonner } from "sonner";

/** App-wide toasts. Trigger with `toast.success(...)` from "sonner" in client components. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-inverse !text-ink-inverse !border-0 !rounded-md !shadow-(--shadow-3) !font-sans",
          description: "!text-ink-inverse/80",
        },
      }}
    />
  );
}

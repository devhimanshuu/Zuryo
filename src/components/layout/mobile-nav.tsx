"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Role } from "@/lib/validation/enums";

/**
 * Slide-in drawer for workspace navigation under 1024px. Radix handles focus trap and Escape.
 * The drawer shows the same sidebar content as desktop; following any link inside closes it.
 */
export function MobileNav({ role, children }: { role: Role; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-md text-ink hover:bg-sunken lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent side="left" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <DialogDescription className="sr-only">Pages in the {role.toLowerCase()} workspace</DialogDescription>
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

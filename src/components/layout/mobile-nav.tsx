"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wordmark } from "@/components/shared/wordmark";
import type { Role } from "@/lib/validation/enums";
import type { Persona } from "@/server/auth/actor";
import { NavLinks } from "./nav-links";
import { RoleSwitcher } from "./role-switcher";

/** Slide-in drawer for workspace navigation under 1024px. Radix handles focus trap and Escape. */
export function MobileNav({
  role,
  personaName,
  personaId,
  personas,
}: {
  role: Role;
  personaName: string;
  personaId?: string;
  personas?: Persona[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-md text-ink hover:bg-sunken lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent side="left" aria-describedby={undefined}>
        <div className="flex h-16 items-center px-5">
          <Wordmark />
        </div>
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <DialogDescription className="sr-only">Pages in the {role.toLowerCase()} workspace</DialogDescription>
        <nav aria-label="Workspace" className="flex-1 px-3">
          <NavLinks role={role} onNavigate={() => setOpen(false)} />
        </nav>
        <div className="border-t border-hairline p-3">
          <RoleSwitcher
            role={role}
            personaName={personaName}
            personaId={personaId}
            personas={personas}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { ArrowRight, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wordmark } from "@/components/shared/wordmark";
import { ThemeControl } from "./theme-control";

/** Under 768px the marketing nav links move into a slide-in sheet, so every page stays reachable. */
export function MarketingMobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="-mr-2 grid size-10 place-items-center rounded-md text-ink hover:bg-sunken md:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent side="left">
        <div className="flex h-16 items-center px-5">
          <Wordmark />
        </div>
        <DialogTitle className="sr-only">Menu</DialogTitle>
        <DialogDescription className="sr-only">Pages on the Zuryo site</DialogDescription>
        <nav aria-label="Main" className="flex-1 px-3 pt-2">
          <ul className="grid gap-0.5">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={close}
                  className="flex h-12 items-center justify-between rounded-md px-3 text-body-lg font-semibold text-ink hover:bg-sunken"
                >
                  {l.label}
                  <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-2 border-t border-hairline p-4">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="text-body-sm font-semibold text-ink-muted">Theme</span>
            <ThemeControl />
          </div>
          <Button asChild variant="primary" size="lg">
            <Link href="/customer/bookings/new" onClick={close}>
              Book a trainer
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/sign-in" onClick={close}>
              Sign in
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

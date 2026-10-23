"use client";

import { Check, KeyRound, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/shared/avatar";
import { DEMO_PASSWORD } from "@/lib/auth/demo-password";
import type { Role } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";

/** Seeded demo accounts (see prisma/seed-data.ts). All share one demo password. */
export const DEMO_ACCOUNTS: Array<{ role: Role; name: string; email: string }> = [
  { role: "CUSTOMER", name: "Priya Sharma", email: "priya.sharma@demo.zuryofit.example" },
  { role: "CUSTOMER", name: "Rahul Verma", email: "rahul.verma@demo.zuryofit.example" },
  { role: "CUSTOMER", name: "Farhan Qureshi", email: "farhan.qureshi@demo.zuryofit.example" },
  { role: "TRAINER", name: "Arjun Mehta", email: "arjun.mehta@demo.zuryofit.example" },
  { role: "TRAINER", name: "Kavya Rao", email: "kavya.rao@demo.zuryofit.example" },
  { role: "OPERATIONS", name: "Neha Kapoor", email: "neha.kapoor@demo.zuryofit.example" },
];

const GROUPS: Array<{ role: Role; label: string }> = [
  { role: "CUSTOMER", label: "Customer" },
  { role: "TRAINER", label: "Trainer" },
  { role: "OPERATIONS", label: "Operations" },
];

/**
 * A launcher pinned to the bottom-left corner that opens the seeded accounts above it. It floats
 * over the page (fixed), so the sign-in column never grows or scrolls because of it. Escape or a
 * click outside closes it; choosing an account fills the form and hands focus to "Sign in".
 */
export function DemoAccounts({
  selectedEmail,
  onPick,
  roles,
}: {
  selectedEmail: string;
  onPick: (role: Role, email: string) => void;
  /** Only these workspaces' accounts are listed. */
  roles: Role[];
}) {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Rendered into <body> once mounted: a transformed ancestor (the page's entrance animation)
  // would otherwise anchor this "fixed" corner to the card instead of the window.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("[data-account]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      launcher.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !launcher.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed bottom-4 left-4 z-40 sm:bottom-6 sm:left-6">
      {open ? (
        <div
          ref={panel}
          id="demo-accounts"
          role="dialog"
          aria-labelledby="demo-accounts-title"
          className="absolute bottom-full left-0 mb-3 flex max-h-[min(70dvh,34rem)] w-[min(22rem,calc(100vw-2rem))] animate-rise flex-col overflow-hidden rounded-lg border border-hairline bg-raised shadow-(--shadow-3)"
        >
          <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 pt-3.5 pb-3">
            <div>
              <h2 id="demo-accounts-title" className="font-semibold">
                Demo accounts
              </h2>
              <p className="text-body-sm text-ink-muted">Pick one to fill in the form.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                launcher.current?.focus();
              }}
              className="-mr-1.5 grid size-8 place-items-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink"
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">Close demo accounts</span>
            </button>
          </div>

          <div className="grid gap-4 overflow-y-auto px-2 py-3">
            {GROUPS.filter((g) => roles.includes(g.role)).map((g) => (
              <section key={g.role} aria-label={`${g.label} accounts`} className="grid gap-1">
                <p
                  className="px-2 text-[11px] font-semibold tracking-[0.08em] text-ink-subtle uppercase"
                  aria-hidden
                >
                  {g.label}
                </p>
                <ul className="grid gap-0.5">
                  {DEMO_ACCOUNTS.filter((a) => a.role === g.role).map((a) => {
                    const selected = selectedEmail === a.email;
                    return (
                      <li key={a.email}>
                        <button
                          type="button"
                          data-account
                          onClick={() => {
                            onPick(a.role, a.email);
                            setOpen(false);
                          }}
                          aria-pressed={selected}
                          className={cn(
                            "flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-150",
                            selected ? "bg-brand-soft/70" : "hover:bg-sunken",
                          )}
                        >
                          <Avatar name={a.name} size="sm" tone={selected ? "brand" : "neutral"} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{a.name}</span>
                            <span className="block truncate text-xs text-ink-muted">{a.email}</span>
                          </span>
                          {selected ? <Check className="size-4 shrink-0 text-brand" aria-hidden /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <p className="flex items-start gap-2 border-t border-hairline bg-info-soft px-4 py-3 text-body-sm text-info">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Synthetic data. Every account uses the password{" "}
              <code className="rounded-sm bg-info/10 px-1 font-semibold">{DEMO_PASSWORD}</code>.
            </span>
          </p>
        </div>
      ) : null}

      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="demo-accounts"
        className="inline-flex items-center gap-2 rounded-full border border-hairline bg-raised/95 py-1.5 pr-4 pl-1.5 text-sm font-semibold text-ink shadow-(--shadow-3) backdrop-blur transition-colors hover:bg-surface"
      >
        <span className="grid size-8 place-items-center rounded-full bg-brand text-on-brand" aria-hidden>
          <Users className="size-4" />
        </span>
        Demo accounts
      </button>
    </div>,
    document.body,
  );
}

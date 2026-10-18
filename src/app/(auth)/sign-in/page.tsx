import { ArrowRight, Dumbbell, LayoutDashboard, TriangleAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Demo access" };

const ROLES = [
  {
    href: "/customer",
    icon: UserRound,
    title: "Customer",
    who: "Priya Sharma · Palm Grove Residences",
    body: "Book instant or scheduled sessions, manage bookings and see fitness history.",
  },
  {
    href: "/trainer",
    icon: Dumbbell,
    title: "Trainer",
    who: "Arjun Mehta · Strength & mobility",
    body: "Assigned sessions and availability management.",
  },
  {
    href: "/operations",
    icon: LayoutDashboard,
    title: "Operations",
    who: "Neha Kapoor · Operations",
    body: "Bookings, trainers and pricing rules.",
  },
];

export default function SignInPage() {
  return (
    <div className="w-full max-w-xl">
      <h1 className="font-display text-display-md">Demo access</h1>
      <p className="mt-2 text-ink-muted">
        Choose a workspace to explore. Each one shows a fictional, seeded persona.
      </p>

      <div role="note" className="mt-5 flex gap-3 rounded-md bg-warning-soft p-3 text-body-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold">There is no real sign-in yet.</strong> This page links to demo
          workspaces only. Inside each workspace you can switch between seeded demo users; the server checks
          that each one only sees and changes their own bookings, but nothing is password-protected.
        </p>
      </div>

      <ul className="mt-6 grid gap-3">
        {ROLES.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="group flex items-center gap-4 rounded-lg border border-hairline bg-raised p-4 transition-shadow hover:shadow-(--shadow-2)"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                <r.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.title}</span>
                <span className="block truncate text-body-sm text-ink-muted">{r.who}</span>
                <span className="block text-body-sm text-ink-subtle">{r.body}</span>
              </span>
              <ArrowRight
                className="size-5 text-ink-subtle transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

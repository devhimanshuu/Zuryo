"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

/** Ends the session and returns to the sign-in page. */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/sign-in" })}
      className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-control bg-raised text-body-sm font-semibold text-ink hover:bg-sunken"
    >
      <LogOut className="size-4" aria-hidden /> Sign out
    </button>
  );
}

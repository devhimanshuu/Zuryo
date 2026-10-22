"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

/** Ends the session and returns to the sign-in page. */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/sign-in" })}
      title="Sign out"
      className="grid size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <LogOut className="size-4" aria-hidden />
      <span className="sr-only">Sign out</span>
    </button>
  );
}

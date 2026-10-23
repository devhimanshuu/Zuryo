"use client";

import { signOut } from "next-auth/react";

/** Drops the half-registered Google session and returns to sign in. */
export function SignOutLink() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/sign-in" })}
      className="font-semibold text-brand hover:underline"
    >
      Use a different account
    </button>
  );
}

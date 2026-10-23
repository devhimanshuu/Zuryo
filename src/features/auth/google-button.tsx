"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
    <path
      fill="#4285F4"
      d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24Z"
    />
    <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.74l4-3.1Z" />
    <path
      fill="#EA4335"
      d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
    />
  </svg>
);

/**
 * "Continue with Google". Every Google round trip returns to /sign-up/complete: existing accounts
 * are forwarded to their workspace (or to `callbackUrl`) from there, new people finish registering.
 */
export function GoogleButton({
  callbackUrl,
  label = "Continue with Google",
  reauth = false,
}: {
  callbackUrl?: string;
  label?: string;
  /** Re-verify the current person: Google must ask for their login again, and no divider is drawn. */
  reauth?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const target = callbackUrl
    ? `/sign-up/complete?next=${encodeURIComponent(callbackUrl)}`
    : "/sign-up/complete";
  return (
    <div className={reauth ? "grid gap-4" : "mb-5 grid gap-4"}>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        loading={pending}
        onClick={() => {
          setPending(true);
          void signIn("google", { callbackUrl: target }, reauth ? { prompt: "login" } : undefined);
        }}
      >
        {pending ? null : <GoogleMark />}
        {label}
      </Button>
      {reauth ? null : (
        <p className="flex items-center gap-3 text-body-sm text-ink-subtle" aria-hidden>
          <span className="h-px flex-1 bg-hairline" />
          or use your email
          <span className="h-px flex-1 bg-hairline" />
        </p>
      )}
    </div>
  );
}

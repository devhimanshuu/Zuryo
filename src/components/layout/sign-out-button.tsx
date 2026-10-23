"use client";

import { LogOut, TriangleAlert } from "lucide-react";
import { signOut } from "next-auth/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Prompts for confirmation before ending the session and returning to sign-in. */
export function SignOutButton() {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut({ callbackUrl: "/sign-in" });
    } catch {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!loading ? setOpen(next) : undefined)}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Sign out"
          aria-label="Sign out"
          className="grid size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="sr-only">Sign out</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger shadow-xs ring-8 ring-danger-soft/40">
            <TriangleAlert className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <DialogTitle className="text-heading-md font-semibold text-ink">Log out of ZuryoFit?</DialogTitle>
            <DialogDescription className="mt-1.5 text-body-sm leading-relaxed text-ink-muted">
              Are you sure you want to log out? Any unsaved changes may be lost and you will need to sign back
              in to access your sessions and account.
            </DialogDescription>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-lg border border-hairline bg-surface/70 p-3.5 text-body-sm text-ink-muted">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-sunken text-ink-subtle">
            <LogOut className="size-4" aria-hidden />
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            You can sign back in anytime with your registered credentials.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={loading}
            onClick={handleSignOut}
            className="w-full shadow-xs sm:w-auto"
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

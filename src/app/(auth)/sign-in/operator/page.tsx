import { ArrowLeft, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/features/auth/sign-in-form";

export const metadata: Metadata = { title: "Operator sign in" };

export default async function OperatorSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="w-full max-w-[440px] animate-rise">
      <p className="flex items-center gap-3 text-eyebrow font-semibold tracking-[0.08em] text-brand uppercase">
        <span className="h-px w-6 bg-brand" aria-hidden />
        Operations console
      </p>
      <h1 className="mt-3 font-display text-display-md">Operator sign in</h1>
      <p className="mt-2 text-ink-muted">
        For Zuryo operations staff: bookings, pricing and oversight. Sign in with your work email and
        password.
      </p>
      <div className="mt-7 rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-2) sm:p-7">
        <SignInForm callbackUrl={callbackUrl} workspaces={["OPERATIONS"]} />
      </div>
      <p className="mt-5 flex items-center gap-2 text-body-sm text-ink-subtle">
        <LayoutDashboard className="size-4 shrink-0" aria-hidden />
        Operations access is checked on the server before the console opens.
      </p>
      <Link
        href="/sign-in"
        className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
        Customer or trainer? Sign in here
      </Link>
    </div>
  );
}

import { ArrowRight, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/features/auth/google-button";
import { SignInForm } from "@/features/auth/sign-in-form";
import { GOOGLE_ERRORS, isGoogleEnabled } from "@/lib/auth/google";
import { Notice } from "@/components/shared/states";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const google = isGoogleEnabled();
  const errorMessage = error ? GOOGLE_ERRORS[error] : undefined;
  return (
    <div className="w-full max-w-[440px] animate-rise">
      <p className="flex items-center gap-3 text-eyebrow font-semibold tracking-[0.08em] text-brand uppercase">
        <span className="h-px w-6 bg-brand" aria-hidden />
        Welcome back
      </p>
      <h1 className="mt-3 font-display text-display-md">Sign in to Zuryo</h1>
      <p className="mt-2 text-ink-muted">
        Choose customer or trainer, then sign in with your email and password.
      </p>
      <div className="mt-7 rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-2) sm:p-7">
        {errorMessage ? (
          <Notice tone="danger" title="Couldn't sign you in" live className="mb-5">
            {errorMessage}
          </Notice>
        ) : null}
        {google ? <GoogleButton callbackUrl={callbackUrl} /> : null}
        <SignInForm callbackUrl={callbackUrl} />
      </div>
      <p className="mt-5 flex items-center gap-2 text-body-sm text-ink-subtle">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Each workspace checks your role on the server before it opens.
      </p>
      <p className="mt-4 text-body-sm text-ink-muted">
        New to Zuryo?{" "}
        <Link href="/sign-up" className="font-semibold text-brand hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-4 border-t border-hairline pt-4 text-body-sm text-ink-muted">
        Part of the operations team?{" "}
        <Link
          href={
            callbackUrl
              ? `/sign-in/operator?callbackUrl=${encodeURIComponent(callbackUrl)}`
              : "/sign-in/operator"
          }
          className="group inline-flex items-center gap-1 font-semibold text-brand hover:underline"
        >
          Log in as operator
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </p>
    </div>
  );
}

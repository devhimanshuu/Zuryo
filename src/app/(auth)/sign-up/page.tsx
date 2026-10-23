import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState } from "@/components/shared/states";
import { GoogleButton } from "@/features/auth/google-button";
import { isGoogleEnabled } from "@/lib/auth/google";
import { SignUpForm } from "@/features/auth/sign-up-form";
import { getDb } from "@/lib/db";
import { safely } from "@/lib/utils/errors";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const zones = await safely(() =>
    getDb().serviceZone.findMany({
      where: { isActive: true },
      orderBy: [{ city: "asc" }, { name: "asc" }],
      select: { id: true, name: true, city: true },
    }),
  );
  if (!zones.ok) return <ErrorState message={zones.error.message} />;
  return (
    <div className="w-full max-w-[440px] animate-rise">
      <p className="flex items-center gap-3 text-eyebrow font-semibold tracking-[0.08em] text-brand uppercase">
        <span className="h-px w-6 bg-brand" aria-hidden />
        Join Zuryo
      </p>
      <h1 className="mt-3 font-display text-display-md">Create your account</h1>
      <p className="mt-2 text-ink-muted">Choose customer or trainer, then tell us a little about you.</p>
      <div className="mt-7 rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-2) sm:p-7">
        {isGoogleEnabled() ? <GoogleButton label="Sign up with Google" /> : null}
        <SignUpForm zones={zones.data} />
      </div>
      <p className="mt-5 flex items-center gap-2 text-body-sm text-ink-subtle">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Operations accounts are created by Zuryo and can&apos;t be registered here.
      </p>
      <p className="mt-4 border-t border-hairline pt-4 text-body-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

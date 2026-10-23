import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { SignUpForm } from "@/features/auth/sign-up-form";
import { SignOutLink } from "@/features/auth/sign-out-link";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { safely } from "@/lib/utils/errors";

export const metadata: Metadata = { title: "Finish signing up" };
export const dynamic = "force-dynamic";

/** Where a Google sign-in lands. Middleware forwards existing accounts; this is for new people. */
export default async function CompleteGoogleSignUpPage() {
  const session = await auth();
  const user = session?.user;
  if (!user?.pending || !user.email) redirect("/sign-in");

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
        Almost there
      </p>
      <h1 className="mt-3 font-display text-display-md">Finish creating your account</h1>
      <p className="mt-2 text-ink-muted">
        Your Google account is verified. Tell us how you&apos;ll use ZuryoFit.
      </p>
      <div className="mt-7 rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-2) sm:p-7">
        <SignUpForm zones={zones.data} google={{ name: user.name ?? "", email: user.email }} />
      </div>
      <p className="mt-4 text-body-sm text-ink-muted">
        Wrong Google account? <SignOutLink />
      </p>
    </div>
  );
}

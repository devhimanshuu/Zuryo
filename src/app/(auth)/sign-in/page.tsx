import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="w-full max-w-md">
      <h1 className="font-display text-display-md">Sign in to Zuryo</h1>
      <p className="mt-2 text-ink-muted">
        Each workspace checks your role server-side. The session is a signed, httpOnly cookie.
      </p>
      <div className="mt-6 rounded-lg border border-hairline bg-raised p-5">
        <SignInForm callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}

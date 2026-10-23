"use server";

import { auth, unstable_update } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Role } from "@/lib/validation/enums";
import { completeGoogleSignUp, signUp } from "@/server/auth/sign-up";
import { fail, type ServiceResult } from "@/server/booking/errors";
import { runAction } from "./run";

/** Public by design: creates a CUSTOMER or TRAINER account, never an operator. */
export async function signUpAction(input: unknown): Promise<ServiceResult<{ email: string; role: Role }>> {
  return runAction("auth:sign-up", () => signUp(getDb(), input));
}

/**
 * Finishes registration for someone who signed in with Google but has no account yet. Identity is
 * read from the signed session, and the session is refreshed so the new role takes effect at once.
 */
export async function completeGoogleSignUpAction(input: unknown): Promise<ServiceResult<{ role: Role }>> {
  return runAction("auth:google-complete", async () => {
    const session = await auth();
    const user = session?.user;
    if (!user?.pending || !user.email) {
      return fail("FORBIDDEN", "Sign in with Google first, then finish creating your account.");
    }
    const result = await completeGoogleSignUp(getDb(), { name: user.name ?? "", email: user.email }, input);
    if (result.ok) await unstable_update({});
    return result;
  });
}

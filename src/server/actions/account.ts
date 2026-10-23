"use server";

import { revalidatePath } from "next/cache";
import { auth, unstable_update } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/utils/errors";
import type { Role } from "@/lib/validation/enums";
import { updatePassword, updateProfile } from "@/server/account/account-service";
import { getActor, type Actor } from "@/server/auth/actor";
import type { ServiceResult } from "@/server/booking/errors";
import { runAction } from "./run";

/* Account actions work for any signed-in role, but only ever on the acting user's own row. */

async function anyActor(): Promise<Actor> {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;
  if (!role) throw new AppError("FORBIDDEN", "Sign in to continue.");
  return getActor(role);
}

export async function updateProfileAction(input: unknown): Promise<ServiceResult<{ name: string }>> {
  return runAction("account:profile", async () => {
    const result = await updateProfile(getDb(), await anyActor(), input);
    if (result.ok) {
      await unstable_update({});
      revalidatePath("/", "layout");
    }
    return result;
  });
}

export async function updatePasswordAction(input: unknown): Promise<ServiceResult<{ hadPassword: boolean }>> {
  return runAction("account:password", async () => {
    const actor = await anyActor();
    const session = await auth();
    const result = await updatePassword(
      getDb(),
      actor,
      { method: session?.user?.authMethod, at: session?.user?.authAt },
      input,
    );
    if (result.ok) revalidatePath("/", "layout");
    return result;
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import type { ServiceResult } from "@/server/booking/errors";
import { saveFitnessProfile } from "@/server/fitness/fitness-service";
import { runAction } from "./run";

/* Customer fitness profile. The action resolves the acting customer on the server and scopes the
 * write to that user; a client-supplied id is never treated as identity. */

export async function saveFitnessProfileAction(input: unknown): Promise<ServiceResult<{ goals: number }>> {
  return runAction("fitness:save-profile", async () => {
    const result = await saveFitnessProfile(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) {
      revalidatePath("/customer/fitness");
      revalidatePath("/customer", "layout");
      revalidatePath("/operations", "layout");
    }
    return result;
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import { fail, type ServiceResult } from "@/server/booking/errors";
import { updatePricing } from "@/server/booking/pricing-service";
import { reconcileDueSessions } from "@/server/sessions/session-service";
import { runAction } from "./run";

/* Operations-only actions. The role is checked on the server; hiding a button is not authorisation. */

export async function savePricingAction(input: unknown): Promise<ServiceResult<{ changed: Array<"NORMAL" | "PEAK"> }>> {
  return runAction("pricing:save", async () => {
    const result = await updatePricing(defaultDeps(), await getActor("OPERATIONS"), input);
    if (result.ok) {
      revalidatePath("/operations", "layout");
      revalidatePath("/customer", "layout");
    }
    return result;
  });
}

export async function reconcileSessionsAction(): Promise<
  ServiceResult<{ checked: number; warned: number; completed: number }>
> {
  return runAction("sessions:reconcile-all", async () => {
    const actor = await getActor("OPERATIONS");
    if (actor.role !== "OPERATIONS") return fail("FORBIDDEN", "Only operations can run reconciliation.");
    const counts = await reconcileDueSessions(defaultDeps());
    revalidatePath("/", "layout");
    return { ok: true, data: counts };
  });
}

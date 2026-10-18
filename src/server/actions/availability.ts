"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import type { ServiceResult } from "@/server/booking/errors";
import { addAvailability, removeAvailability } from "@/server/booking/trainer-availability-service";
import { runAction } from "./run";

export async function addAvailabilityAction(input: unknown): Promise<ServiceResult<{ id: string }>> {
  return runAction("availability:add", async () => {
    const result = await addAvailability(defaultDeps(), await getActor("TRAINER"), input);
    if (result.ok) revalidatePath("/trainer", "layout");
    return result;
  });
}

export async function removeAvailabilityAction(input: unknown): Promise<ServiceResult<{ id: string }>> {
  return runAction("availability:remove", async () => {
    const result = await removeAvailability(defaultDeps(), await getActor("TRAINER"), input);
    if (result.ok) revalidatePath("/trainer", "layout");
    return result;
  });
}

"use server";

import { getActor } from "@/server/auth/actor";
import type { ServiceResult } from "@/server/booking/errors";
import { askCoach, clearCoachHistory, defaultCoachDeps } from "@/server/coach/coach-service";
import type { CoachMessageView } from "@/lib/coach/thread";
import { runAction } from "./run";

/* Customer chat with the fitness coach. Identity is resolved on the server; a client-supplied id
 * is never treated as identity, so one customer can't read or write another's conversation. */

export async function askCoachAction(input: unknown): Promise<ServiceResult<CoachMessageView>> {
  return runAction("coach:ask", async () => askCoach(defaultCoachDeps(), await getActor("CUSTOMER"), input));
}

export async function clearCoachHistoryAction(): Promise<ServiceResult<{ deleted: number }>> {
  return runAction("coach:clear", async () =>
    clearCoachHistory(defaultCoachDeps(), await getActor("CUSTOMER")),
  );
}

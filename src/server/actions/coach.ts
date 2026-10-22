"use server";

import { getActor } from "@/server/auth/actor";
import { ok, type ServiceResult } from "@/server/booking/errors";
import { askCoach, clearCoachHistory, defaultCoachDeps, getCoachThread } from "@/server/coach/coach-service";
import type { CoachMessageView } from "@/lib/coach/thread";
import { runAction } from "./run";

/* Customer chat with the fitness coach. Identity is resolved on the server; a client-supplied id
 * is never treated as identity, so one customer can't read or write another's conversation. */

/** The stored conversation, loaded when the floating coach is opened for the first time. */
export async function loadCoachThreadAction(): Promise<ServiceResult<CoachMessageView[]>> {
  return runAction("coach:thread", async () => {
    const actor = await getActor("CUSTOMER");
    return ok(await getCoachThread(defaultCoachDeps().db, actor.userId));
  });
}

export async function askCoachAction(input: unknown): Promise<ServiceResult<CoachMessageView>> {
  return runAction("coach:ask", async () => askCoach(defaultCoachDeps(), await getActor("CUSTOMER"), input));
}

export async function clearCoachHistoryAction(): Promise<ServiceResult<{ deleted: number }>> {
  return runAction("coach:clear", async () =>
    clearCoachHistory(defaultCoachDeps(), await getActor("CUSTOMER")),
  );
}

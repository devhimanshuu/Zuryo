"use server";

import { getActor } from "@/server/auth/actor";
import { ok, type ServiceResult } from "@/server/booking/errors";
import {
  askCoach,
  clearCoachHistory,
  defaultCoachDeps,
  getCoachThreadWithSuggestions,
  undoLastCoachTurn,
} from "@/server/coach/coach-service";
import type { CoachMessageView } from "@/lib/coach/thread";
import type { CoachNudge } from "@/lib/coach/nudge";
import type { SmartSuggestion } from "@/lib/coach/suggestions";
import { runAction } from "./run";

/* Customer chat with the fitness coach. Identity is resolved on the server; a client-supplied id
 * is never treated as identity, so one customer can't read or write another's conversation. */

export type CoachThreadData = {
  messages: CoachMessageView[];
  suggestions: SmartSuggestion[];
  nudge: CoachNudge | null;
};

/** The stored conversation and dynamic smart prompts, loaded when the coach opens. */
export async function loadCoachThreadAction(): Promise<ServiceResult<CoachThreadData>> {
  return runAction("coach:thread", async () => {
    const actor = await getActor("CUSTOMER");
    const deps = defaultCoachDeps();
    return ok(await getCoachThreadWithSuggestions(deps.db, actor.userId, deps.now()));
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

/** Removes the latest question and reply so the client can regenerate or edit it. */
export async function undoLastCoachTurnAction(): Promise<ServiceResult<{ question: string }>> {
  return runAction("coach:undo", async () =>
    undoLastCoachTurn(defaultCoachDeps(), await getActor("CUSTOMER")),
  );
}

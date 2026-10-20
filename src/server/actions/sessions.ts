"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import type { ServiceResult } from "@/server/booking/errors";
import {
  completeSession,
  saveSessionSummary,
  startSession,
  submitSessionFeedback,
  syncSessionForTrainer,
  type SessionState,
} from "@/server/sessions/session-service";
import { runAction } from "./run";

/* Trainer session controls. Only the trainer assigned to a booking can act on it (checked in the service). */

function revalidateSessionViews() {
  revalidatePath("/trainer", "layout");
  revalidatePath("/customer", "layout");
  revalidatePath("/operations", "layout");
}

export async function startSessionAction(input: unknown): Promise<ServiceResult<SessionState>> {
  return runAction("sessions:start", async () => {
    const result = await startSession(defaultDeps(), await getActor("TRAINER"), input);
    if (result.ok) revalidateSessionViews();
    return result;
  });
}

export async function completeSessionAction(input: unknown): Promise<ServiceResult<SessionState>> {
  return runAction("sessions:complete", async () => {
    const result = await completeSession(defaultDeps(), await getActor("TRAINER"), input);
    if (result.ok) revalidateSessionViews();
    return result;
  });
}

/**
 * Called by the session screen when its countdown crosses the warning or the deadline. Runs the same
 * idempotent reconciliation as the cron endpoint and returns the persisted state.
 */
export async function syncSessionAction(input: unknown): Promise<ServiceResult<SessionState & { changed: boolean }>> {
  return runAction("sessions:sync", async () => {
    const result = await syncSessionForTrainer(defaultDeps(), await getActor("TRAINER"), input);
    if (result.ok && result.data.changed) revalidateSessionViews();
    return result;
  });
}

/** The assigned trainer saves activities, notes and the suggested next workout. */
export async function saveSessionSummaryAction(
  input: unknown,
): Promise<ServiceResult<{ bookingId: string; activities: number }>> {
  return runAction("sessions:summary", async () => {
    const result = await saveSessionSummary(defaultDeps(), await getActor("TRAINER"), input);
    if (result.ok) revalidateSessionViews();
    return result;
  });
}

/** The customer's feedback on one of their completed sessions. */
export async function submitSessionFeedbackAction(input: unknown): Promise<ServiceResult<{ bookingId: string }>> {
  return runAction("sessions:feedback", async () => {
    const result = await submitSessionFeedback(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) revalidateSessionViews();
    return result;
  });
}

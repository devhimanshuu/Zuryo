"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import type { ServiceResult } from "@/server/booking/errors";
import {
  defaultFitnessDeps,
  generateRecommendation,
  saveFitnessProfile,
  setRecommendationStatus,
  submitRecommendationFeedback,
  type GenerationResult,
} from "@/server/fitness/fitness-service";
import { runAction } from "./run";

/* Customer fitness profile + recommendations. Every action resolves the acting customer on the
 * server and scopes reads/writes to that user; a client-supplied id is never treated as identity. */

function revalidateFitness() {
  revalidatePath("/customer/fitness");
  revalidatePath("/customer", "layout");
  revalidatePath("/operations", "layout");
}

export async function saveFitnessProfileAction(input: unknown): Promise<ServiceResult<{ goals: number }>> {
  return runAction("fitness:save-profile", async () => {
    const result = await saveFitnessProfile(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) revalidateFitness();
    return result;
  });
}

export async function generateRecommendationAction(input: unknown): Promise<ServiceResult<GenerationResult>> {
  return runAction("fitness:generate", async () => {
    const result = await generateRecommendation(defaultFitnessDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) revalidateFitness();
    return result;
  });
}

export async function submitRecommendationFeedbackAction(
  input: unknown,
): Promise<ServiceResult<{ recommendationId: string }>> {
  return runAction("fitness:feedback", async () => {
    const result = await submitRecommendationFeedback(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) revalidateFitness();
    return result;
  });
}

export async function setRecommendationStatusAction(
  input: unknown,
): Promise<ServiceResult<{ recommendationId: string; status: "ACTIVE" | "ARCHIVED" }>> {
  return runAction("fitness:status", async () => {
    const result = await setRecommendationStatus(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) revalidateFitness();
    return result;
  });
}

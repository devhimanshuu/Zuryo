import { z } from "zod";
import {
  equipmentOptionSchema,
  fitnessGoalSchema,
  fitnessLevelSchema,
  workoutEnvironmentSchema,
  workoutIntensitySchema,
} from "./enums";

/** Caps for voluntary free-text profile fields. Kept small on purpose: enough to be useful, short
 * enough that the recommendation context never turns into a dump of personal data. */
export const PROFILE_TEXT_MAX = 300;

const optionalText = (label: string) =>
  z
    .string()
    .trim()
    .max(PROFILE_TEXT_MAX, `${label} must be under ${PROFILE_TEXT_MAX} characters`)
    .optional()
    .or(z.literal("").transform(() => undefined));

/** What the fitness profile form submits. Goals carry optional tracking detail per goal. */
export const fitnessProfileSchema = z
  .object({
    fitnessLevel: fitnessLevelSchema.nullish(),
    fitnessGoals: z.array(fitnessGoalSchema).max(4, "Choose at most 4 goals"),
    goals: z
      .record(
        z.string(),
        z
          .object({
            target: z.string().trim().max(120, "Target must be under 120 characters").optional().or(z.literal("")),
            targetDate: z.string().optional().or(z.literal("")),
            status: z.enum(["ACTIVE", "COMPLETED"]),
          })
          .strict(),
      )
      .default({}),
    intensity: workoutIntensitySchema.nullish(),
    equipment: z.array(equipmentOptionSchema).max(5, "Choose at most 5 pieces of equipment").default([]),
    environment: workoutEnvironmentSchema.nullish(),
    avoidExercises: optionalText("Avoid list"),
    accommodations: optionalText("Accommodations"),
    movementLimitations: optionalText("Movement limitations"),
    goalDetails: optionalText("Goal notes"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.fitnessGoals.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["fitnessGoals"],
        message: "Pick at least one goal so recommendations have something to work with",
      });
    }
    for (const [key] of Object.entries(v.goals)) {
      if (!v.fitnessGoals.includes(key as (typeof v)["fitnessGoals"][number])) {
        ctx.addIssue({
          code: "custom",
          path: ["goals", key],
          message: "This goal isn't selected",
        });
      }
    }
  });

export type FitnessProfileInput = z.input<typeof fitnessProfileSchema>;
export type FitnessProfileOutput = z.output<typeof fitnessProfileSchema>;

/** One goal to generate a recommendation for. Must be one the customer actually selected. */
export const generateRecommendationSchema = z
  .object({ goal: fitnessGoalSchema, regenerate: z.boolean().optional() })
  .strict();

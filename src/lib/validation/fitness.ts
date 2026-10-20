import { z } from "zod";
import {
  equipmentOptionSchema,
  fitnessGoalSchema,
  fitnessLevelSchema,
  workoutEnvironmentSchema,
  workoutIntensitySchema,
  workoutPreferenceSchema,
} from "./enums";

/** Caps for voluntary free-text profile fields. Kept small on purpose: enough to be useful, short
 * enough that the recommendation context never turns into a dump of personal data. */
export const PROFILE_TEXT_MAX = 300;

/** Bounds for the assessment's body measurements. Adults only; both fields stay optional. */
export const AGE_RANGE = { min: 16, max: 100 } as const;
export const WEIGHT_KG_RANGE = { min: 25, max: 250 } as const;

/** Optional number from a form field: "" / null / undefined mean "not given". */
const optionalNumber = (label: string, range: { min: number; max: number }, integer: boolean) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce
      .number({ error: `${label} must be a number` })
      .refine((n) => !integer || Number.isInteger(n), `${label} must be a whole number`)
      .refine((n) => n >= range.min && n <= range.max, `${label} must be between ${range.min} and ${range.max}`)
      .optional(),
  );

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
    age: optionalNumber("Age", AGE_RANGE, true),
    /** Kilograms, stored to one decimal place. */
    weightKg: optionalNumber("Weight", WEIGHT_KG_RANGE, false),
    fitnessLevel: fitnessLevelSchema.nullish(),
    fitnessGoals: z.array(fitnessGoalSchema).max(4, "Choose at most 4 goals"),
    workoutPreferences: z.array(workoutPreferenceSchema).max(8).default([]),
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

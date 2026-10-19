import { z } from "zod";
import {
  equipmentOptionSchema,
  fitnessGoalSchema,
  workoutCategorySchema,
  workoutIntensitySchema,
} from "@/lib/validation/enums";

/**
 * The one structured shape every recommendation must fit, whether an LLM produced it or the
 * rule-based fallback did. The AI provider is asked for exactly this shape and its answer is
 * validated against it before anything is stored or shown; the fallback builds it directly.
 */

const repsExercise = z
  .object({
    kind: z.literal("REPS"),
    name: z.string().trim().min(2).max(60),
    sets: z.number().int().min(1, "Sets must be at least 1").max(6, "Sets must be at most 6"),
    reps: z.number().int().min(2, "Reps must be at least 2").max(30, "Reps must be at most 30"),
    cue: z.string().trim().max(140).optional(),
  })
  .strict();

const timedExercise = z
  .object({
    kind: z.literal("TIMED"),
    name: z.string().trim().min(2).max(60),
    durationMin: z.number().int().min(1, "Duration must be at least 1 minute").max(30, "Duration must be at most 30 minutes"),
    cue: z.string().trim().max(140).optional(),
  })
  .strict();

const exerciseSchema = z.discriminatedUnion("kind", [repsExercise, timedExercise]);

const bounded = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is too short`).max(max, `${label} is too long`);

export const recommendationOutputSchema = z
  .object({
    title: bounded(5, 80, "Title"),
    /** One or two sentences describing the workout itself, not marketing copy. */
    summary: bounded(20, 300, "Summary"),
    category: workoutCategorySchema,
    durationMinutes: z
      .number()
      .int()
      .min(20, "Duration must be at least 20 minutes")
      .max(60, "Duration must be at most 60 minutes"),
    intensity: workoutIntensitySchema,
    goal: fitnessGoalSchema,
    warmup: bounded(10, 200, "Warm-up"),
    cooldown: bounded(10, 200, "Cool-down"),
    rest: bounded(5, 120, "Rest guidance"),
    safety: bounded(10, 300, "Safety notes"),
    adaptations: bounded(10, 300, "Adaptations"),
    /** What to do next in Zuryo, e.g. "Book a STRENGTH session with a trainer nearby." */
    nextAction: bounded(10, 200, "Next action"),
    equipment: z.array(equipmentOptionSchema).max(5),
    exercises: z.array(exerciseSchema).min(3, "A workout needs at least 3 exercises").max(8, "A workout has at most 8 exercises"),
  })
  .strict();

export type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;

export const recommendationPayloadSchema = recommendationOutputSchema;
export type RecommendationPayload = RecommendationOutput;

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

/**
 * Length limits the model is asked to respect (in the tool schema and the prompt). Validation of
 * prose fields allows up to PROSE_TOLERANCE times that, so a slightly wordy but otherwise valid plan
 * isn't thrown away; sizes stay bounded either way. Titles and exercise names keep their exact
 * limits because the layout depends on them.
 */
export const PROSE_LIMITS = {
  summary: 300,
  warmup: 200,
  cooldown: 200,
  rest: 120,
  safety: 300,
  adaptations: 300,
  nextAction: 200,
} as const;
export const PROSE_TOLERANCE = 2;
const prose = (min: number, field: keyof typeof PROSE_LIMITS, label: string) =>
  bounded(min, PROSE_LIMITS[field] * PROSE_TOLERANCE, label);

export const recommendationOutputSchema = z
  .object({
    title: bounded(5, 80, "Title"),
    /** One or two sentences describing the workout itself, not marketing copy. */
    summary: prose(20, "summary", "Summary"),
    category: workoutCategorySchema,
    durationMinutes: z
      .number()
      .int()
      .min(20, "Duration must be at least 20 minutes")
      .max(60, "Duration must be at most 60 minutes"),
    intensity: workoutIntensitySchema,
    goal: fitnessGoalSchema,
    warmup: prose(10, "warmup", "Warm-up"),
    cooldown: prose(10, "cooldown", "Cool-down"),
    rest: prose(5, "rest", "Rest guidance"),
    safety: prose(10, "safety", "Safety notes"),
    adaptations: prose(10, "adaptations", "Adaptations"),
    /** What to do next in Zuryo, e.g. "Book a STRENGTH session with a trainer nearby." */
    nextAction: prose(10, "nextAction", "Next action"),
    equipment: z.array(equipmentOptionSchema).max(5),
    exercises: z.array(exerciseSchema).min(3, "A workout needs at least 3 exercises").max(8, "A workout has at most 8 exercises"),
  })
  .strict();

export type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;

export const recommendationPayloadSchema = recommendationOutputSchema;
export type RecommendationPayload = RecommendationOutput;

import { z } from "zod";

/**
 * What a trainer records about a session, and what the customer says afterwards. These fill the
 * structured SessionRecord columns (activities JSON, trainerNotes, suggestedNextWorkout,
 * customerFeedback); duration is never typed in, it comes from the server's startedAt/completedAt.
 */
export const SESSION_ACTIVITIES_MAX = 12;
export const TRAINER_NOTES_MAX = 1000;
export const SUGGESTED_NEXT_MAX = 300;
export const CUSTOMER_FEEDBACK_MAX = 500;

const bookingId = z.string().trim().min(1, "Choose a session").max(40);

/** Optional whole number from a form field ("" means not given). */
const optionalCount = (label: string, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce
      .number({ error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(1, `${label} must be at least 1`)
      .max(max, `${label} must be at most ${max}`)
      .optional(),
  );

/** Strip control characters (keeping newlines and tabs) and trim; empty becomes undefined. */
const freeText = (max: number, label: string) =>
  z
    .string()
    .max(max * 2)
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max, `${label} must be under ${max} characters`))
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * One exercise or activity done in the session: sets × reps, a duration, or both (e.g. 3 × 40 s
 * planks). The form offers minutes; seconds exist for short holds recorded in the seed data.
 */
export const sessionActivitySchema = z
  .object({
    name: z.string().trim().min(2, "Name the exercise").max(60, "Keep the name under 60 characters"),
    sets: optionalCount("Sets", 10),
    reps: optionalCount("Reps", 100),
    durationMin: optionalCount("Minutes", 60),
    durationSec: optionalCount("Seconds", 600),
  })
  .strict();

export type SessionActivity = z.output<typeof sessionActivitySchema>;

/** A form row the trainer left completely empty is "no activity", not an invalid one. */
function blankRowToUndefined(row: unknown): unknown {
  if (typeof row !== "object" || row === null) return row;
  return Object.values(row).every((v) => v === undefined || v === null || String(v).trim() === "") ? undefined : row;
}

export const sessionSummarySchema = z
  .object({
    bookingId,
    // Blank rows are dropped after validation (not before), so error paths keep the row's index.
    activities: z
      .array(z.preprocess(blankRowToUndefined, sessionActivitySchema.optional()))
      .max(SESSION_ACTIVITIES_MAX, `List at most ${SESSION_ACTIVITIES_MAX} activities`)
      .default([])
      .transform((rows) => rows.filter((a): a is SessionActivity => a !== undefined)),
    trainerNotes: freeText(TRAINER_NOTES_MAX, "Notes"),
    suggestedNextWorkout: freeText(SUGGESTED_NEXT_MAX, "Suggested next workout"),
  })
  .strict();

export type SessionSummaryInput = z.input<typeof sessionSummarySchema>;

export const sessionFeedbackSchema = z
  .object({
    bookingId,
    feedback: z
      .string()
      .max(CUSTOMER_FEEDBACK_MAX * 2)
      .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
      .pipe(
        z
          .string()
          .min(2, "Write a few words about the session")
          .max(CUSTOMER_FEEDBACK_MAX, `Keep feedback under ${CUSTOMER_FEEDBACK_MAX} characters`),
      ),
  })
  .strict();

export type SessionFeedbackInput = z.input<typeof sessionFeedbackSchema>;

/** Activities stored as JSON are read back defensively: anything malformed is dropped, not shown. */
export function parseActivities(json: unknown): SessionActivity[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((a) => {
    const parsed = sessionActivitySchema.safeParse(a);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Actual minutes between the server's start and completion timestamps (rounded), or null. */
export function actualDurationMinutes(startedAt: Date, completedAt: Date | null): number | null {
  if (!completedAt) return null;
  return Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 60_000));
}

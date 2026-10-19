import { z } from "zod";
import { startTimeProblem } from "@/lib/booking/availability";
import {
  CANCELLATION_REASON_MAX_LENGTH,
  INSTANT_WINDOW_MINUTES,
  MAX_ADVANCE_DAYS,
  NOTES_MAX_LENGTH,
  SESSION_MINUTES,
  SLOT_INTERVAL_MINUTES,
} from "@/lib/booking/rules";
import { isValidDateKey } from "@/lib/booking/time";
import { availabilityStatusSchema, bookingModeSchema, workoutCategorySchema } from "./enums";
import { bookingPaymentSchema } from "./payments";

export { INSTANT_WINDOW_MINUTES, MAX_ADVANCE_DAYS, SESSION_MINUTES };

const id = z.string().trim().min(1, "Required").max(40);

/** Drop control characters (keeping newlines and tabs) from free text before it is stored. */
const cleanText = (max: number, tooLong: string) =>
  z
    .string()
    .max(max * 2) // cheap upper bound before trimming
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max, tooLong))
    .optional()
    .transform((v) => (v ? v : undefined));

export const bookingNotesSchema = cleanText(
  NOTES_MAX_LENGTH,
  `Keep notes under ${NOTES_MAX_LENGTH} characters`,
);

/**
 * What a customer sends to create a booking. Note what is NOT here: price, commission, total,
 * service zone and the assigned trainer are all decided by the server. `preferredTrainerId` is the
 * trainer the customer picked from the server's matches; the server re-checks that they are still
 * eligible. `expectedTotal` is only compared with the server's price, never used as the price.
 * `now` is injectable for deterministic tests.
 */
export function createBookingInputSchema(now: () => Date = () => new Date()) {
  return z
    .object({
      mode: bookingModeSchema,
      workoutCategory: workoutCategorySchema,
      /** SCHEDULED: the chosen slot. INSTANT: the slot the server proposed in its instant offer. */
      startAt: z.coerce.date({ error: "Choose a time" }),
      preferredTrainerId: id.optional(),
      notes: bookingNotesSchema,
      expectedTotal: z
        .string()
        .regex(/^\d{1,8}\.\d{2}$/, "Invalid amount")
        .optional(),
      /** A session from one of the customer's packages, or a (simulated) payment. */
      payment: bookingPaymentSchema,
      /** Client-generated UUID; retries with the same key return the same booking. */
      idempotencyKey: z.string().uuid("idempotencyKey must be a UUID"),
    })
    .strict()
    .superRefine((input, ctx) => {
      const problem = startTimeProblem(input.mode, input.startAt, now());
      if (problem) ctx.addIssue({ code: "custom", path: ["startAt"], message: problem });
    });
}

export type CreateBookingInput = z.infer<ReturnType<typeof createBookingInputSchema>>;

export const cancelBookingInputSchema = z
  .object({
    bookingId: id,
    reason: cleanText(
      CANCELLATION_REASON_MAX_LENGTH,
      `Keep the reason under ${CANCELLATION_REASON_MAX_LENGTH} characters`,
    ),
  })
  .strict();

export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;

/** Wizard lookups. */
export const scheduleQuerySchema = z.object({ workoutCategory: workoutCategorySchema }).strict();
export const instantQuerySchema = z.object({ workoutCategory: workoutCategorySchema }).strict();
export const matchQuerySchema = z
  .object({
    workoutCategory: workoutCategorySchema,
    mode: bookingModeSchema,
    startAt: z.coerce.date({ error: "Choose a time" }),
  })
  .strict();

const minuteOfDay = z
  .number({ error: "Choose a time" })
  .int()
  .min(0)
  .max(24 * 60)
  .refine((m) => m % SLOT_INTERVAL_MINUTES === 0, "Times are on the hour or half hour");

/** A trainer adding available or blocked time on one local day. */
export const availabilityInputSchema = z
  .object({
    date: z.string().refine(isValidDateKey, "Choose a date"),
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
    status: availabilityStatusSchema,
    note: cleanText(80, "Keep the note under 80 characters"),
  })
  .strict()
  .refine((v) => v.endMinute > v.startMinute, {
    message: "End time must be after start time",
    path: ["endMinute"],
  })
  .refine((v) => v.status === "BLOCKED" || v.endMinute - v.startMinute >= SESSION_MINUTES, {
    message: `Available time must be at least ${SESSION_MINUTES} minutes long`,
    path: ["endMinute"],
  });

export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;

export const removeAvailabilityInputSchema = z.object({ availabilityId: id }).strict();

import { z } from "zod";
import { bookingModeSchema } from "./enums";

export const SESSION_MINUTES = 60;
export const INSTANT_WINDOW_MINUTES = 60;
export const MAX_ADVANCE_DAYS = 30;

const cuid = z.string().trim().min(1, "Required").max(40);

/**
 * What a customer sends to create a booking. Note what is NOT here: price, commission, total and
 * trainer assignment are all decided by the server. `now` is injectable for deterministic tests.
 */
export function createBookingInputSchema(now: () => Date = () => new Date()) {
  return z
    .object({
      mode: bookingModeSchema,
      serviceZoneId: cuid,
      /** Required for SCHEDULED; must be omitted for INSTANT (the server picks the start). */
      startAt: z.coerce.date().optional(),
      preferredTrainerId: cuid.optional(),
      /** Client-generated UUID; retries with the same key return the same booking. */
      idempotencyKey: z.string().uuid("idempotencyKey must be a UUID"),
    })
    .strict()
    .superRefine((input, ctx) => {
      if (input.mode === "INSTANT") {
        if (input.startAt) {
          ctx.addIssue({
            code: "custom",
            path: ["startAt"],
            message: "Instant bookings don't take a start time",
          });
        }
        return;
      }
      if (!input.startAt) {
        ctx.addIssue({ code: "custom", path: ["startAt"], message: "Choose a time for a scheduled booking" });
        return;
      }
      const start = input.startAt.getTime();
      const current = now().getTime();
      if (start <= current + INSTANT_WINDOW_MINUTES * 60_000) {
        ctx.addIssue({
          code: "custom",
          path: ["startAt"],
          message: "Scheduled sessions start more than 60 minutes from now. Use Instant for sooner.",
        });
      }
      if (start > current + MAX_ADVANCE_DAYS * 86_400_000) {
        ctx.addIssue({
          code: "custom",
          path: ["startAt"],
          message: `Book at most ${MAX_ADVANCE_DAYS} days ahead`,
        });
      }
      if (input.startAt.getUTCMinutes() % 30 !== 0 || input.startAt.getUTCSeconds() !== 0) {
        ctx.addIssue({ code: "custom", path: ["startAt"], message: "Slots start on the hour or half hour" });
      }
    });
}

export type CreateBookingInput = z.infer<ReturnType<typeof createBookingInputSchema>>;

export const cancelBookingInputSchema = z
  .object({
    bookingId: cuid,
    reason: z.string().trim().max(280).optional(),
  })
  .strict();

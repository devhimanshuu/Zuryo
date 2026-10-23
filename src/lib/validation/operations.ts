import { z } from "zod";
import { CANCELLATION_REASON_MAX_LENGTH } from "@/lib/booking/rules";

const id = z.string().trim().min(1, "Required").max(40);

const note = z
  .string()
  .trim()
  .max(160, "Keep the note under 160 characters")
  .optional()
  .transform((value) => (value ? value : undefined));

/** Operations moving a session to another trainer without changing its time or price. */
export const reassignBookingInputSchema = z
  .object({ bookingId: id, trainerId: id, note })
  .strict();

export type ReassignBookingInput = z.infer<typeof reassignBookingInputSchema>;

/** Operations cancelling a booking always leaves a reason for the customer. */
export const operationsCancelBookingInputSchema = z
  .object({
    bookingId: id,
    reason: z
      .string()
      .trim()
      .min(3, "Add a short reason for the customer")
      .max(CANCELLATION_REASON_MAX_LENGTH, `Keep the reason under ${CANCELLATION_REASON_MAX_LENGTH} characters`),
  })
  .strict();

export const operationsBookingQuerySchema = z.object({ bookingId: id }).strict();

export const operationsTrainerQuerySchema = z.object({ trainerId: id }).strict();

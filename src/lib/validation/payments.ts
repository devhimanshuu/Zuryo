import { z } from "zod";

/**
 * Demo checkout: the customer explicitly chooses the simulated provider's answer. Nothing is random
 * and no card, UPI or bank details exist anywhere in the request.
 */
export const SIMULATED_OUTCOMES = ["SUCCEED", "DECLINE"] as const;
export const simulatedOutcomeSchema = z.enum(SIMULATED_OUTCOMES, { error: "Choose a payment outcome" });
export type SimulatedOutcome = z.infer<typeof simulatedOutcomeSchema>;

const id = z.string().trim().min(1, "Required").max(40);

export const startPackageCheckoutSchema = z
  .object({ planId: id, checkoutKey: z.string().uuid("checkoutKey must be a UUID") })
  .strict();

export const payForPackageSchema = z
  .object({
    packageId: id,
    outcome: simulatedOutcomeSchema,
    idempotencyKey: z.string().uuid("idempotencyKey must be a UUID"),
  })
  .strict();

export const discardCheckoutSchema = z.object({ packageId: id }).strict();

/** How a booking is paid for: one session from an owned package, or a simulated payment. */
export const bookingPaymentSchema = z.discriminatedUnion(
  "method",
  [
    z.object({ method: z.literal("PACKAGE"), packageId: id }).strict(),
    z.object({ method: z.literal("SIMULATED_PAYMENT"), outcome: simulatedOutcomeSchema }).strict(),
  ],
  { error: "Choose how to pay" },
);
export type BookingPayment = z.infer<typeof bookingPaymentSchema>;

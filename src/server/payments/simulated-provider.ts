import "server-only";
import { randomUUID } from "node:crypto";
import type { SimulatedOutcome } from "@/lib/validation/payments";

/**
 * The demo payment "provider". It never sees card data and its answer is whatever the request asked
 * for, so every outcome is deterministic and testable. Swapping in a real gateway means replacing
 * this function with an authorised charge plus a webhook that finalises the same Payment row.
 */
export function runSimulatedPayment(outcome: SimulatedOutcome): {
  status: "SUCCEEDED" | "FAILED";
  providerReference: string;
  failureReason: string | null;
} {
  const providerReference = `SIM-${randomUUID().slice(0, 13).toUpperCase()}`;
  return outcome === "SUCCEED"
    ? { status: "SUCCEEDED", providerReference, failureReason: null }
    : { status: "FAILED", providerReference, failureReason: "Simulated decline (demo checkout)" };
}

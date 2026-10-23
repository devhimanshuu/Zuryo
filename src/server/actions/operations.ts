"use server";

import { revalidatePath } from "next/cache";
import { operationsBookingQuerySchema, operationsCancelBookingInputSchema, operationsTrainerQuerySchema } from "@/lib/validation/operations";
import { getActor } from "@/server/auth/actor";
import { cancelBooking, type CancelledBooking } from "@/server/booking/booking-service";
import { defaultDeps } from "@/server/booking/deps";
import { fail, type ServiceResult } from "@/server/booking/errors";
import { reassignBooking, type ReassignedBooking } from "@/server/booking/operations-booking-service";
import { updatePricing } from "@/server/booking/pricing-service";
import { getOperationsBookingDetail, type OperationsBookingDetail } from "@/server/queries/operations-booking-detail";
import { getOperationsTrainerDetail, type OperationsTrainerDetail } from "@/server/queries/operations-trainer-detail";
import { reconcileDueSessions } from "@/server/sessions/session-service";
import { runAction } from "./run";

/* Operations-only actions. The role is checked on the server; hiding a button is not authorisation. */

function revalidateBookingViews() {
  revalidatePath("/operations", "layout");
  revalidatePath("/customer", "layout");
  revalidatePath("/trainer", "layout");
}

export async function getOperationsBookingDetailAction(
  bookingId: unknown,
): Promise<ServiceResult<OperationsBookingDetail>> {
  return runAction("operations-booking:detail", async () => {
    await getActor("OPERATIONS");
    const parsed = operationsBookingQuerySchema.safeParse({ bookingId });
    if (!parsed.success) return fail("VALIDATION", "Choose a booking to inspect.");
    const detail = await getOperationsBookingDetail(parsed.data.bookingId);
    if (!detail) return fail("NOT_FOUND", "We couldn't find that booking.");
    return { ok: true, data: detail };
  });
}

export async function getOperationsTrainerDetailAction(
  trainerId: unknown,
): Promise<ServiceResult<OperationsTrainerDetail>> {
  return runAction("operations-trainer:detail", async () => {
    await getActor("OPERATIONS");
    const parsed = operationsTrainerQuerySchema.safeParse({ trainerId });
    if (!parsed.success) return fail("VALIDATION", "Choose a trainer to inspect.");
    const detail = await getOperationsTrainerDetail(parsed.data.trainerId);
    if (!detail) return fail("NOT_FOUND", "We couldn't find that trainer.");
    return { ok: true, data: detail };
  });
}

export async function reassignBookingAction(input: unknown): Promise<ServiceResult<ReassignedBooking>> {
  return runAction("operations-booking:reassign", async () => {
    const result = await reassignBooking(defaultDeps(), await getActor("OPERATIONS"), input);
    if (result.ok && !result.data.unchanged) revalidateBookingViews();
    return result;
  });
}

export async function cancelOperationsBookingAction(input: unknown): Promise<ServiceResult<CancelledBooking>> {
  return runAction("operations-booking:cancel", async () => {
    const parsed = operationsCancelBookingInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Add a reason for the customer.");
    }
    const result = await cancelBooking(defaultDeps(), await getActor("OPERATIONS"), parsed.data);
    if (result.ok) revalidateBookingViews();
    return result;
  });
}

export async function savePricingAction(input: unknown): Promise<ServiceResult<{ changed: Array<"NORMAL" | "PEAK"> }>> {
  return runAction("pricing:save", async () => {
    const result = await updatePricing(defaultDeps(), await getActor("OPERATIONS"), input);
    if (result.ok) {
      revalidatePath("/operations", "layout");
      revalidatePath("/customer", "layout");
    }
    return result;
  });
}

export async function reconcileSessionsAction(): Promise<
  ServiceResult<{ checked: number; warned: number; completed: number }>
> {
  return runAction("sessions:reconcile-all", async () => {
    const actor = await getActor("OPERATIONS");
    if (actor.role !== "OPERATIONS") return fail("FORBIDDEN", "Only operations can run reconciliation.");
    const counts = await reconcileDueSessions(defaultDeps());
    revalidatePath("/", "layout");
    return { ok: true, data: counts };
  });
}

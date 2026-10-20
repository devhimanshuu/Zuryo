"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { instantQuerySchema, matchQuerySchema, scheduleQuerySchema } from "@/lib/validation/booking";
import { getActor, type Actor } from "@/server/auth/actor";
import { getSchedule, loadCustomerContext, type ScheduleView } from "@/server/booking/availability-service";
import {
  cancelBooking,
  createBooking,
  type CancelledBooking,
  type CreatedBooking,
} from "@/server/booking/booking-service";
import { defaultDeps } from "@/server/booking/deps";
import { fail, type ServiceResult } from "@/server/booking/errors";
import { getInstantOffer, getMatches, type MatchResult } from "@/server/booking/matching-service";
import {
  getRescheduleOptions,
  rescheduleBooking,
  type RescheduledBooking,
  type RescheduleOptions,
} from "@/server/booking/reschedule-service";
import { runAction } from "./run";

/*
 * Server actions for the booking flow. Every action resolves the acting user from the NextAuth
 * session (see src/server/auth/actor.ts) and validates its input with Zod; nothing the browser
 * sends is trusted for identity, price, availability or trainer assignment.
 */

async function withCustomer<T>(
  label: string,
  body: (ctx: {
    actor: Actor;
    customer: NonNullable<Awaited<ReturnType<typeof loadCustomerContext>>>;
  }) => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  return runAction(label, async () => {
    const actor = await getActor("CUSTOMER");
    const customer = await loadCustomerContext(defaultDeps().db, actor.userId);
    if (!customer) return fail("NOT_FOUND", "We couldn't find an active customer profile for this account.");
    return body({ actor, customer });
  });
}

function invalid(error: z.ZodError) {
  return fail<never>("VALIDATION", error.issues[0]?.message ?? "Invalid request", {
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  });
}

export async function getScheduleAction(input: unknown): Promise<ServiceResult<ScheduleView>> {
  return withCustomer("schedule", async ({ customer }) => {
    const parsed = scheduleQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    return { ok: true, data: await getSchedule(defaultDeps(), customer, parsed.data.workoutCategory) };
  });
}

export async function getInstantOfferAction(input: unknown): Promise<ServiceResult<MatchResult>> {
  return withCustomer("instant-offer", async ({ customer }) => {
    const parsed = instantQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    return getInstantOffer(defaultDeps(), customer, parsed.data.workoutCategory);
  });
}

export async function getMatchesAction(input: unknown): Promise<ServiceResult<MatchResult>> {
  return withCustomer("matches", async ({ customer }) => {
    const parsed = matchQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    return getMatches(defaultDeps(), customer, {
      category: parsed.data.workoutCategory,
      startAt: parsed.data.startAt,
      mode: parsed.data.mode,
    });
  });
}

function revalidateBookingViews() {
  revalidatePath("/customer", "layout");
  revalidatePath("/trainer", "layout");
  revalidatePath("/operations", "layout");
}

export async function createBookingAction(input: unknown): Promise<ServiceResult<CreatedBooking>> {
  return runAction("create-booking", async () => {
    const result = await createBooking(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) revalidateBookingViews();
    return result;
  });
}

export async function cancelBookingAsCustomerAction(
  input: unknown,
): Promise<ServiceResult<CancelledBooking>> {
  return runAction("cancel-booking:customer", async () => {
    const result = await cancelBooking(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) revalidateBookingViews();
    return result;
  });
}

export async function cancelBookingAsTrainerAction(input: unknown): Promise<ServiceResult<CancelledBooking>> {
  return runAction("cancel-booking:trainer", async () => {
    const result = await cancelBooking(defaultDeps(), await getActor("TRAINER"), input);
    if (result.ok) revalidateBookingViews();
    return result;
  });
}

export async function getRescheduleOptionsAction(input: unknown): Promise<ServiceResult<RescheduleOptions>> {
  return runAction("reschedule-options", async () =>
    getRescheduleOptions(defaultDeps(), await getActor("CUSTOMER"), input),
  );
}

export async function rescheduleBookingAction(input: unknown): Promise<ServiceResult<RescheduledBooking>> {
  return runAction("reschedule-booking", async () => {
    const result = await rescheduleBooking(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok && !result.data.unchanged) revalidateBookingViews();
    return result;
  });
}

import "server-only";
import type { BookingStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { categoryLabel } from "@/lib/booking/categories";
import { SESSION_MINUTES, SESSION_START_LATE_MINUTES } from "@/lib/booking/rules";
import { addMinutes } from "@/lib/booking/time";
import {
  completeBlocker,
  completionFor,
  reconcileDecision,
  startBlocker,
  type SessionClock,
} from "@/lib/sessions/lifecycle";
import { formatTime } from "@/lib/utils/format";
import { sessionFeedbackSchema, sessionSummarySchema } from "@/lib/validation/sessions";
import type { Actor } from "@/server/auth/actor";
import type { BookingDeps, DbOrTx } from "@/server/booking/deps";
import { fail, ok, type ServiceResult } from "@/server/booking/errors";
import { withTrip } from "@/server/location/trip";
import { notify } from "@/server/notifications/notification-service";

/**
 * Session lifecycle on the server. Every transition locks the booking row and checks the current
 * state first, so repeated or concurrent requests are no-ops rather than duplicates:
 *
 *   start     CONFIRMED → IN_PROGRESS; writes SessionRecord.startedAt and endsAt = start + 60 min once
 *   warning   at endsAt − 5 min: warningSentAt set once (conditional update) + notifications (dedupe key)
 *   complete  IN_PROGRESS → COMPLETED by the trainer from the warning on, or at endsAt by reconciliation
 *
 * Nothing depends on a browser staying open. `reconcileSession` derives what is due purely from the
 * persisted timestamps, and is called by the session screen, page loads, the operations dashboard
 * and the cron endpoint (/api/cron/session-lifecycle).
 */

const bookingIdSchema = z.object({ bookingId: z.string().trim().min(1).max(40) }).strict();

type LockedBooking = {
  id: string;
  reference: string;
  status: BookingStatus;
  startAt: Date;
  customerId: string;
  trainerId: string | null;
  workoutCategory: string | null;
};

async function lockBooking(tx: Prisma.TransactionClient, bookingId: string): Promise<LockedBooking | null> {
  const rows = await tx.$queryRaw<LockedBooking[]>`
    SELECT "id", "reference", "status", "startAt", "customerId", "trainerId", "workoutCategory"::text AS "workoutCategory"
    FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  return rows[0] ?? null;
}

export type SessionState = {
  bookingId: string;
  status: BookingStatus;
  startedAt: string | null;
  endsAt: string | null;
  plannedMinutes: number;
  warningSentAt: string | null;
  completedAt: string | null;
  completionSource: "TRAINER" | "DEADLINE" | null;
  /** Server time when this state was read, so the browser can correct for its own clock. */
  serverNow: string;
  /** True when the request found the transition already done (idempotent repeat). */
  alreadyDone?: boolean;
};

async function readState(db: DbOrTx, bookingId: string, now: Date): Promise<SessionState | null> {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      sessionRecord: {
        select: {
          startedAt: true,
          endsAt: true,
          plannedMinutes: true,
          warningSentAt: true,
          completedAt: true,
          completionSource: true,
        },
      },
    },
  });
  if (!b) return null;
  const s = b.sessionRecord;
  return {
    bookingId: b.id,
    status: b.status,
    startedAt: s?.startedAt.toISOString() ?? null,
    endsAt: s?.endsAt.toISOString() ?? null,
    plannedMinutes: s?.plannedMinutes ?? SESSION_MINUTES,
    warningSentAt: s?.warningSentAt?.toISOString() ?? null,
    completedAt: s?.completedAt?.toISOString() ?? null,
    completionSource: s?.completionSource ?? null,
    serverNow: now.toISOString(),
  };
}

async function finalizeCompletion(
  tx: Prisma.TransactionClient,
  b: LockedBooking,
  s: SessionClock & { id: string },
  completion: { completedAt: Date; source: "TRAINER" | "DEADLINE" },
) {
  const moved = await tx.booking.updateMany({
    where: { id: b.id, status: "IN_PROGRESS" },
    data: { status: "COMPLETED" },
  });
  if (moved.count === 0) return false;
  await tx.sessionRecord.updateMany({
    where: { id: s.id, completedAt: null },
    data: { completedAt: completion.completedAt, completionSource: completion.source },
  });
  const what = categoryLabel(b.workoutCategory as Parameters<typeof categoryLabel>[0]);
  const how =
    completion.source === "DEADLINE"
      ? "It closed automatically at its 60-minute end time."
      : `Ended by the trainer at ${formatTime(completion.completedAt)}.`;
  await notify(
    tx,
    [b.customerId, b.trainerId]
      .filter((id): id is string => !!id)
      .map((recipientId) => ({
        recipientId,
        bookingId: b.id,
        type: "SESSION_COMPLETED" as const,
        title: "Session completed",
        message: `${what} (${b.reference}) is complete. ${how}`,
        dedupeKey: `session-completed:${b.id}:${recipientId}`,
      })),
  );
  return true;
}

/** The assigned trainer starts a confirmed session inside its start window. Idempotent. */
export async function startSession(deps: BookingDeps, actor: Actor, raw: unknown): Promise<ServiceResult<SessionState>> {
  if (actor.role !== "TRAINER") return fail("FORBIDDEN", "Only the assigned trainer can start a session.");
  const parsed = bookingIdSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose a session to start.");
  const now = deps.now();

  return deps.db.$transaction(async (tx): Promise<ServiceResult<SessionState>> => {
    const b = await lockBooking(tx, parsed.data.bookingId);
    if (!b || b.trainerId !== actor.userId) return fail("NOT_FOUND", "We couldn't find that session.");
    if (b.status === "IN_PROGRESS") {
      // A repeated start (double click, retry, second tab) never resets the start time or deadline.
      const state = await readState(tx, b.id, now);
      return ok({ ...state!, alreadyDone: true });
    }
    const blocker = startBlocker(b, now);
    if (blocker) return fail("CONFLICT", blocker);

    await tx.booking.update({ where: { id: b.id }, data: { status: "IN_PROGRESS" } });
    const endsAt = addMinutes(now, SESSION_MINUTES);
    await tx.sessionRecord.create({
      data: { bookingId: b.id, startedAt: now, endsAt, plannedMinutes: SESSION_MINUTES },
    });
    await notify(tx, [
      {
        recipientId: b.customerId,
        bookingId: b.id,
        type: "SESSION_STARTED",
        title: "Your session has started",
        message: `${categoryLabel(b.workoutCategory as Parameters<typeof categoryLabel>[0])} started at ${formatTime(now)} and runs until ${formatTime(endsAt)}.`,
        dedupeKey: `session-started:${b.id}`,
      },
    ]);
    return ok((await readState(tx, b.id, now))!);
  }, deps.tx);
}

/**
 * The assigned trainer ends a session, from the 55-minute wrap-up on. After the deadline the
 * completion is recorded at the deadline itself. A completed session can never go back to running.
 */
export async function completeSession(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<SessionState>> {
  if (actor.role !== "TRAINER") return fail("FORBIDDEN", "Only the assigned trainer can end a session.");
  const parsed = bookingIdSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose a session to end.");
  const now = deps.now();

  return deps.db.$transaction(async (tx): Promise<ServiceResult<SessionState>> => {
    const b = await lockBooking(tx, parsed.data.bookingId);
    if (!b || b.trainerId !== actor.userId) return fail("NOT_FOUND", "We couldn't find that session.");
    const s = await tx.sessionRecord.findUnique({ where: { bookingId: b.id } });
    if (b.status === "COMPLETED") return ok({ ...(await readState(tx, b.id, now))!, alreadyDone: true });
    const blocker = completeBlocker(b.status, s, now);
    if (blocker || !s) return fail("CONFLICT", blocker ?? "Only a session in progress can be completed.");
    await finalizeCompletion(tx, b, s, completionFor(s, now));
    return ok((await readState(tx, b.id, now))!);
  }, deps.tx);
}

/**
 * Bring one in-progress session up to date with the clock: send the 55-minute warning once, or
 * close the session at its deadline once. Safe to call any number of times, from anywhere.
 */
export async function reconcileSession(
  deps: BookingDeps,
  bookingId: string,
): Promise<{ warned: boolean; completed: boolean }> {
  const now = deps.now();
  return deps.db.$transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (!b) return { warned: false, completed: false };
    const s = await tx.sessionRecord.findUnique({ where: { bookingId } });
    const decision = reconcileDecision(b.status, s, now);
    if (!s) return { warned: false, completed: false };

    if (decision.complete) {
      return { warned: false, completed: await finalizeCompletion(tx, b, s, completionFor(s, now)) };
    }
    if (decision.sendWarning) {
      const marked = await tx.sessionRecord.updateMany({
        where: { id: s.id, warningSentAt: null },
        data: { warningSentAt: now },
      });
      if (marked.count === 1) {
        await notify(
          tx,
          [b.trainerId, b.customerId]
            .filter((id): id is string => !!id)
            .map((recipientId) => ({
              recipientId,
              bookingId: b.id,
              type: "SESSION_WARNING" as const,
              title: "5 minutes left",
              message: `Your session has reached ${s.plannedMinutes - 5} minutes. Please begin wrapping up. It ends at ${formatTime(s.endsAt)}.`,
              dedupeKey: `session-warning:${b.id}:${recipientId}`,
            })),
        );
        return { warned: true, completed: false };
      }
    }
    return { warned: false, completed: false };
  }, deps.tx);
}

/**
 * Reconcile every in-progress session that has a warning or completion due (optionally only one
 * trainer's or one customer's). Returns counts for the caller to report.
 */
export async function reconcileDueSessions(
  deps: BookingDeps,
  scope: { trainerId?: string; customerId?: string } = {},
  limit = 100,
): Promise<{ checked: number; warned: number; completed: number }> {
  const now = deps.now();
  const due = await deps.db.sessionRecord.findMany({
    where: {
      completedAt: null,
      booking: { status: "IN_PROGRESS", ...scope },
      // Anything past its warning point (endsAt − 5 min) is due for a warning, completion or both.
      endsAt: { lte: addMinutes(now, 5) },
    },
    orderBy: { endsAt: "asc" },
    take: limit,
    select: { bookingId: true },
  });
  let warned = 0;
  let completed = 0;
  for (const { bookingId } of due) {
    const r = await reconcileSession(deps, bookingId);
    warned += Number(r.warned);
    completed += Number(r.completed);
  }
  return { checked: due.length, warned, completed };
}

/** Lifecycle state for the assigned trainer (reconciled first, so it is never stale). */
export async function getSessionForTrainer(deps: BookingDeps, actor: Actor, bookingId: string) {
  if (actor.role !== "TRAINER" || bookingId.length > 40) return null;
  const owned = await deps.db.booking.findFirst({ where: { id: bookingId, trainerId: actor.userId }, select: { id: true } });
  if (!owned) return null;
  await reconcileSession(deps, bookingId);
  const row = await deps.db.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: {
        select: {
          addressLine: true,
          fitnessGoals: true,
          fitnessLevel: true,
          user: { select: { name: true } },
        },
      },
      serviceZone: { select: { name: true, timezone: true, latitude: true, longitude: true } },
      trainer: { select: { baseLatitude: true, baseLongitude: true } },
      sessionRecord: true,
      package: { select: { name: true } },
      payments: { where: { status: { in: ["SUCCEEDED", "REFUNDED"] } }, select: { status: true } },
    },
  });
  return row ? withTrip(row) : null;
}

/**
 * Sessions operations should look at: in progress past their deadline but not yet reconciled, and
 * confirmed sessions whose start window has closed without the trainer starting them.
 */
export async function getSessionsNeedingAttention(db: DbOrTx, now: Date) {
  const startCutoff = addMinutes(now, -SESSION_START_LATE_MINUTES);
  const [overdue, notStarted] = await Promise.all([
    db.booking.findMany({
      where: { status: "IN_PROGRESS", sessionRecord: { completedAt: null, endsAt: { lte: now } } },
      orderBy: { startAt: "asc" },
      take: 20,
      include: {
        customer: { select: { user: { select: { name: true } } } },
        trainer: { select: { user: { select: { name: true } } } },
        sessionRecord: { select: { endsAt: true } },
      },
    }),
    db.booking.findMany({
      where: { status: "CONFIRMED", startAt: { lt: startCutoff } },
      orderBy: { startAt: "desc" },
      take: 20,
      include: {
        customer: { select: { user: { select: { name: true } } } },
        trainer: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);
  return { overdue, notStarted };
}

/**
 * For the session screen: the assigned trainer asks the server to bring the session up to date
 * (warning / deadline) and gets the persisted state back. The browser's clock decides nothing.
 */
export async function syncSessionForTrainer(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<SessionState & { changed: boolean }>> {
  if (actor.role !== "TRAINER") return fail("FORBIDDEN", "Only the assigned trainer can view this session.");
  const parsed = bookingIdSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose a session.");
  const owned = await deps.db.booking.findFirst({
    where: { id: parsed.data.bookingId, trainerId: actor.userId },
    select: { id: true },
  });
  if (!owned) return fail("NOT_FOUND", "We couldn't find that session.");
  const r = await reconcileSession(deps, owned.id);
  const state = await readState(deps.db, owned.id, deps.now());
  return state ? ok({ ...state, changed: r.warned || r.completed }) : fail("NOT_FOUND", "We couldn't find that session.");
}

// ─── Session records: the trainer's summary and the customer's feedback ─────

/**
 * The assigned trainer records what happened: activities, notes for the customer and a suggested
 * next workout. Allowed once the session has started (in progress or completed) and editable
 * afterwards; the timestamps stay server-owned and are never part of this input.
 */
export async function saveSessionSummary(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ bookingId: string; activities: number }>> {
  if (actor.role !== "TRAINER") return fail("FORBIDDEN", "Only the assigned trainer can write the session summary.");
  const parsed = sessionSummarySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the session summary.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;
  const booking = await deps.db.booking.findFirst({
    where: { id: input.bookingId, trainerId: actor.userId },
    select: { id: true, status: true, sessionRecord: { select: { id: true } } },
  });
  if (!booking) return fail("NOT_FOUND", "We couldn't find that session.");
  if (!booking.sessionRecord || (booking.status !== "IN_PROGRESS" && booking.status !== "COMPLETED")) {
    return fail("CONFLICT", "Start the session before writing its summary.");
  }
  await deps.db.sessionRecord.update({
    where: { id: booking.sessionRecord.id },
    data: {
      activities: input.activities as Prisma.InputJsonValue,
      trainerNotes: input.trainerNotes ?? null,
      suggestedNextWorkout: input.suggestedNextWorkout ?? null,
    },
  });
  return ok({ bookingId: booking.id, activities: input.activities.length });
}

/** The customer leaves (or edits) feedback on one of their own completed sessions. */
export async function submitSessionFeedback(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ bookingId: string }>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only the customer can give feedback on a session.");
  const parsed = sessionFeedbackSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check your feedback.", {
      fieldErrors: { feedback: parsed.error.issues.map((i) => i.message) },
    });
  }
  // Scoped to the acting customer and to completed sessions in one conditional update, so another
  // customer's booking id or an unfinished session simply matches nothing.
  const res = await deps.db.sessionRecord.updateMany({
    where: {
      bookingId: parsed.data.bookingId,
      completedAt: { not: null },
      booking: { customerId: actor.userId, status: "COMPLETED" },
    },
    data: { customerFeedback: parsed.data.feedback },
  });
  if (res.count === 1) return ok({ bookingId: parsed.data.bookingId });
  const owned = await deps.db.booking.findFirst({
    where: { id: parsed.data.bookingId, customerId: actor.userId },
    select: { id: true },
  });
  return owned
    ? fail("CONFLICT", "You can leave feedback once the session is completed.")
    : fail("NOT_FOUND", "We couldn't find that session.");
}

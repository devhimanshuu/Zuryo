import "server-only";
import type { Actor } from "@/server/auth/actor";
import type { BookingDeps } from "@/server/booking/deps";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export type LiveSnapshot = {
  /** Fingerprint of what this actor's pages show; it moves whenever another person changes it. */
  token: string;
  /** True when this call itself recorded a 55-minute warning or a 60-minute completion. */
  reconciled: boolean;
  serverNow: string;
};

/**
 * What an open workspace page polls to stay current without a reload.
 *
 * 1. Reconciles the actor's due sessions first. While anyone involved in a session has ZuryoFit open
 *    (customer, trainer or operations), its 55-minute warning and 60-minute completion are recorded
 *    within one poll, even if the trainer's session screen is closed.
 * 2. Returns a fingerprint of the actor's bookings (status, time, trainer, reschedules), session
 *    records (start, warning, completion, notes) and notifications. Every write to those rows goes
 *    through Prisma, so `updatedAt` moves with each change; counts catch inserts.
 *
 * Three small aggregate queries, run in parallel, scoped to the actor like every other read.
 */
export async function getLiveSnapshot(deps: BookingDeps, actor: Actor): Promise<LiveSnapshot> {
  const scope =
    actor.role === "CUSTOMER"
      ? { customerId: actor.userId }
      : actor.role === "TRAINER"
        ? { trainerId: actor.userId }
        : {};
  const r = await reconcileDueSessions(deps, scope, actor.role === "OPERATIONS" ? 20 : 5);

  const [bookings, sessions, notifications] = await Promise.all([
    deps.db.booking.aggregate({ where: scope, _max: { updatedAt: true }, _count: { _all: true } }),
    deps.db.sessionRecord.aggregate({ where: { booking: scope }, _max: { updatedAt: true } }),
    actor.role === "OPERATIONS"
      ? null
      : deps.db.notification.aggregate({
          where: { recipientId: actor.userId },
          _max: { createdAt: true },
          _count: { _all: true },
        }),
  ]);

  const token = [
    bookings._count._all,
    bookings._max.updatedAt?.getTime() ?? 0,
    sessions._max.updatedAt?.getTime() ?? 0,
    notifications?._count._all ?? 0,
    notifications?._max.createdAt?.getTime() ?? 0,
  ].join(".");

  return { token, reconciled: r.warned + r.completed > 0, serverNow: deps.now().toISOString() };
}

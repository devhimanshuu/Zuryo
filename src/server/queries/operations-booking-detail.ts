import { getDb } from "@/lib/db";
import { coverageSummary } from "@/lib/payments/coverage";
import { titleCase } from "@/lib/utils/format";

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** Everything the operations side sheet shows for one booking, with eligible trainers to reassign it to. */
export async function getOperationsBookingDetail(bookingId: string, db = getDb()) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { select: { addressLine: true, user: { select: { name: true, email: true } } } },
      trainer: { select: { userId: true, user: { select: { name: true } } } },
      serviceZone: { select: { name: true, timezone: true } },
      cancelledBy: { select: { name: true, role: true } },
      package: { select: { name: true, totalSessions: true, usedSessions: true } },
      pricingRule: { select: { name: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        select: { status: true, amount: true, createdAt: true, refundedAt: true },
      },
      packageEntries: { orderBy: { createdAt: "asc" }, select: { reason: true, delta: true, createdAt: true } },
      sessionRecord: {
        select: {
          startedAt: true,
          endsAt: true,
          completedAt: true,
          completionSource: true,
          trainerNotes: true,
          customerFeedback: true,
        },
      },
      notifications: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { type: true, title: true, message: true, createdAt: true },
      },
    },
  });
  if (!booking) return null;

  const trainers = booking.workoutCategory
    ? await db.trainerProfile.findMany({
        where: {
          isActive: true,
          serviceZoneId: booking.serviceZoneId,
          workoutCategories: { has: booking.workoutCategory },
        },
        orderBy: { user: { name: "asc" } },
        take: 100,
        select: { userId: true, user: { select: { name: true } } },
      })
    : [];

  const activity: Array<{ at: string; label: string; detail?: string | null }> = [
    { at: booking.createdAt.toISOString(), label: "Booking created" },
  ];
  if (booking.rescheduleCount > 0 && booking.lastRescheduledAt) {
    activity.push({
      at: booking.lastRescheduledAt.toISOString(),
      label: "Booking moved",
      detail: `${booking.rescheduleCount} reschedule${booking.rescheduleCount === 1 ? "" : "s"} in total`,
    });
  }
  if (booking.sessionRecord?.startedAt) {
    activity.push({ at: booking.sessionRecord.startedAt.toISOString(), label: "Session started" });
  }
  if (booking.sessionRecord?.completedAt) {
    activity.push({
      at: booking.sessionRecord.completedAt.toISOString(),
      label: "Session completed",
      detail:
        booking.sessionRecord.completionSource === "DEADLINE"
          ? "Closed at the 60-minute deadline"
          : "Ended by the trainer",
    });
  }
  if (booking.cancelledAt) {
    activity.push({
      at: booking.cancelledAt.toISOString(),
      label: "Booking cancelled",
      detail: booking.cancellationReason ?? undefined,
    });
  }
  for (const note of booking.notifications) {
    activity.push({
      at: note.createdAt.toISOString(),
      label: note.title,
      detail: note.message,
    });
  }
  activity.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    mode: booking.mode,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    workoutCategory: booking.workoutCategory,
    isPeak: booking.isPeak,
    totalAmount: booking.totalAmount.toString(),
    currency: booking.currency,
    notes: booking.customerNotes,
    customer: {
      name: booking.customer.user.name,
      email: booking.customer.user.email,
      addressLine: booking.customer.addressLine,
    },
    trainer: booking.trainer
      ? { userId: booking.trainer.userId, name: booking.trainer.user.name }
      : null,
    zone: { name: booking.serviceZone.name, timezone: booking.serviceZone.timezone },
    package: booking.package,
    pricingRule: booking.pricingRule.name,
    coverage: coverageSummary(booking).label,
    payments: booking.payments.map((p) => ({
      status: p.status,
      amount: p.amount.toString(),
      createdAt: p.createdAt.toISOString(),
      refundedAt: iso(p.refundedAt),
    })),
    packageEntries: booking.packageEntries.map((entry) => ({
      reason: titleCase(entry.reason),
      delta: entry.delta,
      createdAt: entry.createdAt.toISOString(),
    })),
    cancellation: booking.cancelledAt
      ? {
          at: booking.cancelledAt.toISOString(),
          reason: booking.cancellationReason,
          by: booking.cancelledBy?.name ?? null,
          byRole: booking.cancelledBy?.role ?? null,
        }
      : null,
    session: booking.sessionRecord
      ? {
          startedAt: iso(booking.sessionRecord.startedAt),
          endsAt: iso(booking.sessionRecord.endsAt),
          completedAt: iso(booking.sessionRecord.completedAt),
          completionSource: booking.sessionRecord.completionSource,
          trainerNotes: booking.sessionRecord.trainerNotes,
          customerFeedback: booking.sessionRecord.customerFeedback,
        }
      : null,
    activity,
    trainers: trainers.map((t) => ({ userId: t.userId, name: t.user.name })),
  };
}

export type OperationsBookingDetail = NonNullable<
  Awaited<ReturnType<typeof getOperationsBookingDetail>>
>;

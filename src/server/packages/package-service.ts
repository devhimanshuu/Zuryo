import "server-only";
import type { PackageStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  effectiveStatus,
  expiryFrom,
  quotePackage,
  redemptionBlocker,
  remainingSessions,
  type PackageLike,
  type RedemptionBlocker,
} from "@/lib/packages/packages";
import { PAGE_SIZES, paginateRows } from "@/lib/pagination";
import { formatINR } from "@/lib/pricing";
import { formatDay } from "@/lib/utils/format";
import {
  discardCheckoutSchema,
  payForPackageSchema,
  startPackageCheckoutSchema,
} from "@/lib/validation/payments";
import type { Actor } from "@/server/auth/actor";
import { loadCustomerContext } from "@/server/booking/availability-service";
import type { BookingDeps, DbOrTx } from "@/server/booking/deps";
import { fail, isUniqueViolationOn, ok, type ServiceResult } from "@/server/booking/errors";
import { loadActivePricing } from "@/server/booking/pricing-service";
import { notify } from "@/server/notifications/notification-service";
import { runSimulatedPayment } from "@/server/payments/simulated-provider";

const invalid = (error: z.ZodError) =>
  fail<never>("VALIDATION", error.issues[0]?.message ?? "Invalid request", {
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  });

// ─── Catalogue ──────────────────────────────────────────────────────────

export async function listPlans(db: DbOrTx, now: Date) {
  const [plans, pricing] = await Promise.all([
    db.packagePlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { sessionCount: "asc" }],
    }),
    loadActivePricing(db, now),
  ]);
  return {
    standardSessionPrice: pricing.normal.sessionPrice,
    plans: plans.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      sessionCount: p.sessionCount,
      validityDays: p.validityDays,
      quote: quotePackage(p, pricing.normal),
    })),
  };
}

// ─── Customer-owned packages ────────────────────────────────────────────

/** The acting customer's packages (never anyone else's), newest first, one page at a time. */
export async function getCustomerPackages(db: DbOrTx, customerId: string, now: Date, page = 1) {
  return paginateRows({
    page,
    pageSize: PAGE_SIZES.customerPackages,
    count: () => db.package.count({ where: { customerId, status: { not: "CANCELLED" } } }),
    rows: (skip, take) =>
      db.package
        .findMany({
          where: { customerId, status: { not: "CANCELLED" } },
          orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
          skip,
          take,
          include: {
            plan: { select: { slug: true } },
            entries: {
              orderBy: { createdAt: "desc" },
              include: { booking: { select: { id: true, reference: true, startAt: true, status: true } } },
            },
            payments: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                status: true,
                amount: true,
                createdAt: true,
                completedAt: true,
                providerReference: true,
              },
            },
          },
        })
        .then((rows) =>
          rows.map((p) => ({
            ...p,
            effectiveStatus: effectiveStatus(p, now),
            remaining: remainingSessions(p),
          })),
        ),
  });
}

/** Packages that could cover a session, for the booking wizard's payment step (re-checked on submit). */
export async function getRedeemablePackages(db: DbOrTx, customerId: string, now: Date) {
  const rows = await db.package.findMany({
    where: { customerId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ expiresAt: "asc" }],
    select: { id: true, name: true, totalSessions: true, usedSessions: true, expiresAt: true },
  });
  return rows
    .filter((p) => remainingSessions(p) > 0)
    .map((p) => ({ ...p, remaining: remainingSessions(p), expiresAt: p.expiresAt?.toISOString() ?? null }));
}

export async function getCheckout(db: DbOrTx, actor: Actor, packageId: string) {
  if (actor.role !== "CUSTOMER" || packageId.length > 40) return null;
  return db.package.findFirst({
    where: { id: packageId, customerId: actor.userId },
    include: {
      plan: { select: { description: true, slug: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
}

/**
 * Step 1 of buying a package: a PENDING_PAYMENT package with the price fixed now (plan price + the
 * standard rule's society commission). Retrying with the same checkoutKey returns the same package.
 */
export async function startPackageCheckout(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ packageId: string }>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can buy packages.");
  const parsed = startPackageCheckoutSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { planId, checkoutKey } = parsed.data;

  const existing = await deps.db.package.findUnique({
    where: { checkoutKey },
    select: { id: true, customerId: true, planId: true },
  });
  if (existing) {
    return existing.customerId === actor.userId && existing.planId === planId
      ? ok({ packageId: existing.id })
      : fail("CONFLICT", "This checkout request was already used. Refresh and try again.");
  }
  if (!(await loadCustomerContext(deps.db, actor.userId))) {
    return fail("NOT_FOUND", "We couldn't find an active customer profile for this account.");
  }
  const plan = await deps.db.packagePlan.findFirst({ where: { id: planId, isActive: true } });
  if (!plan) return fail("NOT_FOUND", "That package isn't available any more.");

  const pricing = await loadActivePricing(deps.db, deps.now());
  const q = quotePackage(plan, pricing.normal);
  try {
    const pkg = await deps.db.package.create({
      data: {
        customerId: actor.userId,
        planId: plan.id,
        name: plan.name,
        totalSessions: plan.sessionCount,
        usedSessions: 0,
        pricePaid: q.totalAmount,
        basePrice: q.basePrice,
        commissionPercent: q.commissionPercent,
        commissionAmount: q.commissionAmount,
        validityDays: plan.validityDays,
        status: "PENDING_PAYMENT",
        checkoutKey,
      },
      select: { id: true },
    });
    return ok({ packageId: pkg.id });
  } catch (err) {
    if (!isUniqueViolationOn(err, "checkoutKey")) throw err;
    const again = await deps.db.package.findUnique({
      where: { checkoutKey },
      select: { id: true, customerId: true },
    });
    return again?.customerId === actor.userId
      ? ok({ packageId: again.id })
      : fail("CONFLICT", "This checkout request was already used. Refresh and try again.");
  }
}

export type PackagePaymentResult = {
  packageId: string;
  paymentId: string | null;
  /** SUCCEEDED: this request paid. ALREADY_PAID: an earlier payment had already activated it. */
  outcome: "SUCCEEDED" | "ALREADY_PAID";
  replayed: boolean;
};

type LockedPackage = {
  id: string;
  customerId: string;
  status: PackageStatus;
  totalSessions: number;
  usedSessions: number;
  expiresAt: Date | null;
  name: string;
  pricePaid: Prisma.Decimal;
  basePrice: Prisma.Decimal | null;
  commissionAmount: Prisma.Decimal | null;
  validityDays: number | null;
};

/** Row-locks a package so balance changes and activation for it happen one at a time. */
export async function lockPackage(
  tx: Prisma.TransactionClient,
  packageId: string,
): Promise<LockedPackage | null> {
  const rows = await tx.$queryRaw<LockedPackage[]>`
    SELECT "id", "customerId", "status", "totalSessions", "usedSessions", "expiresAt", "name",
           "pricePaid", "basePrice", "commissionAmount", "validityDays"
    FROM "Package" WHERE "id" = ${packageId} FOR UPDATE`;
  return rows[0] ?? null;
}

async function replayPackagePayment(
  deps: BookingDeps,
  actor: Actor,
  packageId: string,
  idempotencyKey: string,
): Promise<ServiceResult<PackagePaymentResult> | null> {
  const prior = await deps.db.payment.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true, packageId: true, package: { select: { customerId: true } } },
  });
  if (!prior) return null;
  if (prior.packageId !== packageId || prior.package?.customerId !== actor.userId) {
    return fail("CONFLICT", "This payment request was already used. Refresh and try again.");
  }
  return prior.status === "FAILED"
    ? fail("PAYMENT_FAILED", "The simulated payment was declined. Your package wasn't activated.")
    : ok({ packageId, paymentId: prior.id, outcome: "SUCCEEDED", replayed: true });
}

/**
 * Step 2: the (simulated) payment. In one transaction, with the package row locked: record the
 * payment and, only if it succeeded, activate the package and start its validity period. A declined
 * payment is recorded but leaves the package unpaid. Retrying with the same idempotency key replays
 * the first answer; a second key after success reports ALREADY_PAID and charges nothing, and a
 * partial unique index allows at most one successful payment per package in any case.
 */
export async function payForPackage(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<PackagePaymentResult>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can pay for packages.");
  const parsed = payForPackageSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { packageId, outcome, idempotencyKey } = parsed.data;

  const replay = await replayPackagePayment(deps, actor, packageId, idempotencyKey);
  if (replay) return replay;

  const now = deps.now();
  try {
    return await deps.db.$transaction(async (tx): Promise<ServiceResult<PackagePaymentResult>> => {
      const pkg = await lockPackage(tx, packageId);
      if (!pkg || pkg.customerId !== actor.userId)
        return fail("NOT_FOUND", "We couldn't find that checkout.");
      if (pkg.status === "CANCELLED") {
        return fail("CONFLICT", "This checkout was discarded. Start a new one from Packages.");
      }
      if (pkg.status !== "PENDING_PAYMENT") {
        const paid = await tx.payment.findFirst({
          where: { packageId, status: { in: ["SUCCEEDED", "REFUNDED"] } },
          select: { id: true },
        });
        return ok({ packageId, paymentId: paid?.id ?? null, outcome: "ALREADY_PAID", replayed: false });
      }

      const result = runSimulatedPayment(outcome);
      const payment = await tx.payment.create({
        data: {
          packageId,
          amount: pkg.pricePaid,
          baseAmount: pkg.basePrice ?? pkg.pricePaid,
          commissionAmount: pkg.commissionAmount ?? "0.00",
          status: result.status,
          providerReference: result.providerReference,
          failureReason: result.failureReason,
          idempotencyKey,
          completedAt: now,
        },
        select: { id: true },
      });

      if (result.status === "FAILED") {
        await notify(tx, [
          {
            recipientId: actor.userId,
            type: "PAYMENT_FAILED",
            title: "Payment declined (demo)",
            message: `The simulated payment of ${formatINR(pkg.pricePaid)} for ${pkg.name} was declined. The package wasn't activated.`,
            packageId,
            paymentId: payment.id,
            dedupeKey: `payment-failed:${payment.id}`,
          },
        ]);
        return fail(
          "PAYMENT_FAILED",
          "The simulated payment was declined. Your package wasn't activated; you can try again.",
        );
      }

      const expiresAt = expiryFrom(now, pkg.validityDays ?? 30);
      await tx.package.update({
        where: { id: packageId },
        data: { status: "ACTIVE", purchasedAt: now, expiresAt },
      });
      await notify(tx, [
        {
          recipientId: actor.userId,
          type: "PACKAGE_PURCHASED",
          title: `${pkg.name} is ready`,
          message: `${pkg.totalSessions} session${pkg.totalSessions === 1 ? "" : "s"} added. Paid ${formatINR(pkg.pricePaid)} (simulated). Valid until ${formatDay(expiresAt)}.`,
          packageId,
          paymentId: payment.id,
          dedupeKey: `package-purchased:${packageId}`,
        },
      ]);
      return ok({ packageId, paymentId: payment.id, outcome: "SUCCEEDED", replayed: false });
    }, deps.tx);
  } catch (err) {
    // A concurrent duplicate: the same key (replay it) or a second successful payment for this package
    // rejected by the partial unique index (the package is already paid).
    if (isUniqueViolationOn(err, "idempotencyKey")) {
      return (
        (await replayPackagePayment(deps, actor, packageId, idempotencyKey)) ??
        fail("CONFLICT", "This payment request was already used. Refresh and try again.")
      );
    }
    if (isUniqueViolationOn(err, "packageId")) {
      return ok({ packageId, paymentId: null, outcome: "ALREADY_PAID", replayed: false });
    }
    throw err;
  }
}

/** Abandon an unpaid checkout. Paid packages can't be discarded. */
export async function discardCheckout(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ packageId: string }>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can manage their checkouts.");
  const parsed = discardCheckoutSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const res = await deps.db.package.updateMany({
    where: { id: parsed.data.packageId, customerId: actor.userId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED" },
  });
  return res.count === 1
    ? ok({ packageId: parsed.data.packageId })
    : fail("CONFLICT", "Only an unpaid checkout can be discarded.");
}

// ─── Redemption and restoration (called inside booking transactions) ──────

/** Validates a locked package for a session; the caller holds the row lock from lockPackage(). */
export function checkRedemption(
  pkg: LockedPackage | null,
  c: { customerId: string; startAt: Date; now: Date },
): RedemptionBlocker | null {
  if (!pkg) return "NOT_OWNER";
  return redemptionBlocker(pkg as PackageLike, c);
}

/**
 * Deduct one session for a booking: an append-only BOOKING_DEBIT ledger row (unique per booking)
 * and the cached counter, in the caller's transaction. Returns sessions left afterwards.
 */
export async function recordRedemption(
  tx: Prisma.TransactionClient,
  pkg: LockedPackage,
  bookingId: string,
): Promise<number> {
  await tx.packageLedgerEntry.create({
    data: { packageId: pkg.id, bookingId, delta: -1, reason: "BOOKING_DEBIT", note: "Session booked" },
  });
  const used = pkg.usedSessions + 1;
  await tx.package.update({
    where: { id: pkg.id },
    data: { usedSessions: used, status: used >= pkg.totalSessions ? "EXHAUSTED" : "ACTIVE" },
  });
  return pkg.totalSessions - used;
}

/**
 * Give a cancelled booking's session back: a CANCELLATION_REFUND ledger row (unique per booking, so
 * a repeated cancel can't restore twice) and the counter. Returns false if it was already restored.
 */
export async function restoreRedemption(
  tx: Prisma.TransactionClient,
  packageId: string,
  bookingId: string,
  now: Date,
): Promise<{ restored: boolean; remaining: number; name: string } | null> {
  const pkg = await lockPackage(tx, packageId);
  if (!pkg) return null;
  const inserted = await tx.packageLedgerEntry.createMany({
    data: [{ packageId, bookingId, delta: 1, reason: "CANCELLATION_REFUND", note: "Booking cancelled" }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return { restored: false, remaining: remainingSessions(pkg), name: pkg.name };
  const used = Math.max(0, pkg.usedSessions - 1);
  const expired = pkg.expiresAt !== null && pkg.expiresAt <= now;
  await tx.package.update({
    where: { id: packageId },
    data: {
      usedSessions: used,
      ...(pkg.status === "EXHAUSTED" && !expired ? { status: "ACTIVE" as const } : {}),
    },
  });
  return { restored: true, remaining: pkg.totalSessions - used, name: pkg.name };
}

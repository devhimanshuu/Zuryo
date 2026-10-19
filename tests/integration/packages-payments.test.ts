import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelBooking, createBooking } from "@/server/booking/booking-service";
import { updatePricing } from "@/server/booking/pricing-service";
import {
  discardCheckout,
  getCustomerPackages,
  lockPackage,
  payForPackage,
  recordRedemption,
  startPackageCheckout,
} from "@/server/packages/package-service";
import {
  NOW,
  PLANS,
  TOMORROW,
  alice,
  bob,
  createTestDb,
  ist,
  ops,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

const db = createTestDb();
const deps = testDeps(db);

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

/** Buys the Starter Pack (5 sessions) for alice with a successful simulated payment. */
async function buyStarter(customer = alice) {
  const checkoutKey = randomUUID();
  const started = await startPackageCheckout(deps, customer, { planId: PLANS.starter, checkoutKey });
  if (!started.ok) throw new Error(started.error.message);
  const paid = await payForPackage(deps, customer, {
    packageId: started.data.packageId,
    outcome: "SUCCEED",
    idempotencyKey: randomUUID(),
  });
  if (!paid.ok) throw new Error(paid.error.message);
  return started.data.packageId;
}

async function packageRow(id: string) {
  return db.package.findUniqueOrThrow({ where: { id }, include: { entries: true, payments: true } });
}

describe("buying a package with the simulated checkout", () => {
  it("activates exactly one package on success, with a price snapshot and an expiry", async () => {
    const checkoutKey = randomUUID();
    const started = await startPackageCheckout(deps, alice, { planId: PLANS.starter, checkoutKey });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const pending = await packageRow(started.data.packageId);
    expect(pending.status).toBe("PENDING_PAYMENT");
    expect([String(pending.basePrice), String(pending.commissionAmount), String(pending.pricePaid)]).toEqual([
      "1895",
      "189.5",
      "2084.5",
    ]);

    const paid = await payForPackage(deps, alice, {
      packageId: started.data.packageId,
      outcome: "SUCCEED",
      idempotencyKey: randomUUID(),
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.data).toMatchObject({ outcome: "SUCCEEDED", replayed: false });

    const row = await packageRow(started.data.packageId);
    expect(row.status).toBe("ACTIVE");
    expect(row.usedSessions).toBe(0);
    expect(row.expiresAt).toEqual(new Date(NOW.getTime() + 60 * 86_400_000));
    expect(row.payments).toHaveLength(1);
    expect(row.payments[0]).toMatchObject({ status: "SUCCEEDED" });
    expect(String(row.payments[0]!.amount)).toBe("2084.5");
    expect(
      await db.notification.count({
        where: { packageId: started.data.packageId, type: "PACKAGE_PURCHASED", recipientId: alice.userId },
      }),
    ).toBe(1);
  });

  it("retrying the same checkout request returns the same pending package", async () => {
    const checkoutKey = randomUUID();
    const first = await startPackageCheckout(deps, alice, { planId: PLANS.starter, checkoutKey });
    const second = await startPackageCheckout(deps, alice, { planId: PLANS.starter, checkoutKey });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.packageId).toBe(first.data.packageId);
    expect(await db.package.count({ where: { checkoutKey } })).toBe(1);
  });

  it("a failed payment is recorded but never activates the package, and a later attempt can succeed", async () => {
    const checkoutKey = randomUUID();
    const started = await startPackageCheckout(deps, alice, { planId: PLANS.starter, checkoutKey });
    if (!started.ok) throw new Error(started.error.message);
    const id = started.data.packageId;

    const declined = await payForPackage(deps, alice, {
      packageId: id,
      outcome: "DECLINE",
      idempotencyKey: randomUUID(),
    });
    expect(declined.ok).toBe(false);
    if (!declined.ok) expect(declined.error.code).toBe("PAYMENT_FAILED");
    const afterDecline = await packageRow(id);
    expect(afterDecline.status).toBe("PENDING_PAYMENT");
    expect(afterDecline.entries).toHaveLength(0);
    expect(afterDecline.payments).toHaveLength(1);
    expect(afterDecline.payments[0]).toMatchObject({ status: "FAILED", failureReason: "Simulated decline (demo checkout)" });

    const retried = await payForPackage(deps, alice, {
      packageId: id,
      outcome: "SUCCEED",
      idempotencyKey: randomUUID(),
    });
    expect(retried.ok).toBe(true);
    const afterRetry = await packageRow(id);
    expect(afterRetry.status).toBe("ACTIVE");
    expect(afterRetry.payments).toHaveLength(2);
    expect(afterRetry.payments.map((p) => p.status).sort()).toEqual(["FAILED", "SUCCEEDED"]);
  });

  it("repeating a payment request with the same idempotency key charges once and replays the first answer", async () => {
    const checkoutKey = randomUUID();
    const started = await startPackageCheckout(deps, alice, { planId: PLANS.starter, checkoutKey });
    if (!started.ok) throw new Error(started.error.message);
    const body = { packageId: started.data.packageId, outcome: "SUCCEED" as const, idempotencyKey: randomUUID() };

    const [a, b] = await Promise.all([
      payForPackage(deps, alice, body),
      payForPackage(deps, alice, body),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(new Set([a.data.paymentId, b.data.paymentId]).size).toBe(1);
    const row = await packageRow(started.data.packageId);
    expect(row.payments).toHaveLength(1);

    // A second attempt with a NEW key after success charges nothing either.
    const again = await payForPackage(deps, alice, {
      packageId: started.data.packageId,
      outcome: "SUCCEED",
      idempotencyKey: randomUUID(),
    });
    expect(again.ok && again.data.outcome === "ALREADY_PAID").toBe(true);
    expect((await packageRow(started.data.packageId)).payments).toHaveLength(1);
  });

  it("discarding a checkout prevents it from ever being paid", async () => {
    const checkoutKey = randomUUID();
    const started = await startPackageCheckout(deps, alice, { planId: PLANS.starter, checkoutKey });
    if (!started.ok) throw new Error(started.error.message);
    const discarded = await discardCheckout(deps, alice, { packageId: started.data.packageId });
    expect(discarded.ok).toBe(true);
    const pay = await payForPackage(deps, alice, {
      packageId: started.data.packageId,
      outcome: "SUCCEED",
      idempotencyKey: randomUUID(),
    });
    expect(pay.ok).toBe(false);
    if (!pay.ok) expect(pay.error.code).toBe("CONFLICT");
  });

  it("a paid package cannot be discarded", async () => {
    const id = await buyStarter();
    const res = await discardCheckout(deps, alice, { packageId: id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFLICT");
    expect((await packageRow(id)).status).toBe("ACTIVE");
  });

  it("only the owning customer can see or pay for a package", async () => {
    const id = await buyStarter();
    const pay = await payForPackage(deps, bob, {
      packageId: id,
      outcome: "SUCCEED",
      idempotencyKey: randomUUID(),
    });
    expect(pay.ok).toBe(false);
    if (!pay.ok) expect(pay.error.code).toBe("NOT_FOUND");

    const owned = await getCustomerPackages(db, alice.userId, NOW);
    expect(owned.map((p) => p.id)).toContain(id);
    expect((await getCustomerPackages(db, bob.userId, NOW)).map((p) => p.id)).not.toContain(id);
  });

  it("refuses package checkout for non-customers", async () => {
    const res = await startPackageCheckout(deps, ops, { planId: PLANS.starter, checkoutKey: randomUUID() });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("redeeming package sessions in bookings", () => {
  it("deducts exactly one session, records the ledger entry and marks coverage", async () => {
    const id = await buyStarter();
    const res = await createBooking(
      deps,
      alice,
      request({ payment: { method: "PACKAGE", packageId: id } }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.coverage).toBe("PACKAGE");
    expect(res.data.packageSessionsLeft).toBe(4);

    const row = await packageRow(id);
    expect(row.usedSessions).toBe(1);
    expect(row.entries).toHaveLength(1);
    expect(row.entries[0]).toMatchObject({ bookingId: res.data.id, reason: "BOOKING_DEBIT", delta: -1 });

    const booking = await db.booking.findUniqueOrThrow({ where: { id: res.data.id } });
    expect(booking.packageId).toBe(id);
    expect(await db.payment.count({ where: { bookingId: res.data.id } })).toBe(0);
    expect(
      await db.notification.count({
        where: { bookingId: res.data.id, type: "PACKAGE_SESSION_REDEEMED", recipientId: alice.userId },
      }),
    ).toBe(1);
  });

  it("refuses to redeem another customer's package", async () => {
    const id = await buyStarter();
    const res = await createBooking(
      deps,
      bob,
      request({ payment: { method: "PACKAGE", packageId: id } }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PACKAGE_UNAVAILABLE");
    expect((await packageRow(id)).usedSessions).toBe(0);
  });

  it("refuses an unpaid, expired or exhausted package", async () => {
    const checkoutKey = randomUUID();
    const started = await startPackageCheckout(deps, alice, { planId: PLANS.starter, checkoutKey });
    if (!started.ok) throw new Error(started.error.message);
    const unpaid = await createBooking(
      deps,
      alice,
      request({ payment: { method: "PACKAGE", packageId: started.data.packageId } }),
    );
    expect(unpaid.ok).toBe(false);
    if (!unpaid.ok) expect(unpaid.error.code).toBe("PACKAGE_UNAVAILABLE");

    const expired = await buyStarter();
    await db.package.update({ where: { id: expired }, data: { expiresAt: new Date("2030-01-06T00:00:00Z") } });
    const exp = await createBooking(deps, alice, request({ payment: { method: "PACKAGE", packageId: expired } }));
    expect(exp.ok).toBe(false);
    if (!exp.ok) expect(exp.error.code).toBe("PACKAGE_UNAVAILABLE");

    const exhausted = await buyStarter();
    await db.package.update({
      where: { id: exhausted },
      data: { usedSessions: 5, status: "EXHAUSTED" },
    });
    const exh = await createBooking(deps, alice, request({ payment: { method: "PACKAGE", packageId: exhausted } }));
    expect(exh.ok).toBe(false);
    if (!exh.ok) expect(exh.error.code).toBe("PACKAGE_UNAVAILABLE");
  });

  it("cannot deduct the same booking twice: the ledger's unique key rejects it", async () => {
    const id = await buyStarter();
    const booking = await createBooking(deps, alice, request({ payment: { method: "PACKAGE", packageId: id } }));
    if (!booking.ok) throw new Error(booking.error.message);

    await expect(
      db.$transaction(async (tx) => {
        const pkg = await lockPackage(tx, id);
        if (!pkg) throw new Error("package missing");
        await recordRedemption(tx, pkg, booking.data.id);
      }),
    ).rejects.toThrow(/unique|Unique|P2002/i);
    const row = await packageRow(id);
    expect(row.usedSessions).toBe(1);
    expect(row.entries).toHaveLength(1);
  });

  it("restores the session on an eligible cancellation, at most once", async () => {
    const id = await buyStarter();
    const booking = await createBooking(deps, alice, request({ payment: { method: "PACKAGE", packageId: id } }));
    if (!booking.ok) throw new Error(booking.error.message);

    const cancelled = await cancelBooking(deps, alice, { bookingId: booking.data.id, reason: "Plans changed" });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.data.restoredSession).toBe(true);

    const row = await packageRow(id);
    expect(row.usedSessions).toBe(0);
    expect(row.entries.map((e) => [e.reason, e.delta])).toEqual([
      ["BOOKING_DEBIT", -1],
      ["CANCELLATION_REFUND", 1],
    ]);
    expect(
      await db.notification.count({
        where: { bookingId: booking.data.id, type: "PACKAGE_SESSION_RESTORED", recipientId: alice.userId },
      }),
    ).toBe(1);

    // A repeated cancel request fails and can't restore a second time.
    const again = await cancelBooking(deps, alice, { bookingId: booking.data.id });
    expect(again.ok).toBe(false);
    expect((await packageRow(id)).entries).toHaveLength(2);
    expect((await packageRow(id)).usedSessions).toBe(0);
  });
});

describe("pricing snapshots stay stable", () => {
  it("changing a rule never rewrites existing bookings' prices", async () => {
    const before = await createBooking(deps, alice, request());
    if (!before.ok) throw new Error(before.error.message);
    expect(before.data.totalAmount).toBe("438.90");

    const saved = await updatePricing(deps, ops, {
      standard: { sessionPrice: "450", commissionPercent: "10" },
      peak: {
        sessionPrice: "499",
        commissionPercent: "10",
        windows: [
          { label: "Weekday mornings", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 540 },
          { label: "Weekday evenings", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 1020, endMinute: 1200 },
        ],
      },
      basedOn: { standardRuleId: "it_normal", peakRuleId: "it_peak" },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.changed).toEqual(["NORMAL"]);

    // The old booking keeps its snapshot and still points at the rule that priced it.
    const old = await db.booking.findUniqueOrThrow({ where: { id: before.data.id } });
    expect([String(old.sessionPrice), String(old.commissionAmount), String(old.totalAmount)]).toEqual([
      "399",
      "39.9",
      "438.9",
    ]);
    expect(old.pricingRuleId).toBe("it_normal");

    // A new booking at a standard time uses the new price (16:00 is outside peak and inside
    // arun's afternoon availability window).
    const after = await createBooking(
      deps,
      bob,
      request({ startAt: ist(TOMORROW, "16:00").toISOString() }),
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data.totalAmount).toBe("495.00");
    const fresh = await db.booking.findUniqueOrThrow({ where: { id: after.data.id } });
    expect(fresh.pricingRuleId).not.toBe("it_normal");
  });

  it("refuses to save pricing for non-operations actors and rejects ambiguous windows", async () => {
    const input = {
      standard: { sessionPrice: "450", commissionPercent: "10" },
      peak: {
        sessionPrice: "499",
        commissionPercent: "10",
        windows: [
          { label: "Mornings", daysOfWeek: [1, 2, 3], startMinute: 360, endMinute: 540 },
          { label: "Breakfast", daysOfWeek: [3, 4], startMinute: 480, endMinute: 600 },
        ],
      },
      basedOn: { standardRuleId: "it_normal", peakRuleId: "it_peak" },
    };
    const forbidden = await updatePricing(deps, alice, input);
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN");

    const ambiguous = await updatePricing(deps, ops, input);
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) {
      expect(ambiguous.error.code).toBe("VALIDATION");
      expect(ambiguous.error.message).toMatch(/another look/);
    }
    expect(await db.pricingRule.count({ where: { isActive: true } })).toBe(2);
  });
});

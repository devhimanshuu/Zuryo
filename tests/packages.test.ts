import { describe, expect, it } from "vitest";
import {
  effectiveStatus,
  expiryFrom,
  quotePackage,
  redemptionBlocker,
  remainingSessions,
  type PackageLike,
} from "@/lib/packages/packages";
import { coverageSummary } from "@/lib/payments/coverage";

const NOW = new Date("2026-10-19T04:30:00Z");
const SESSION = new Date("2026-10-20T04:30:00Z");
const standard = { sessionPrice: "399.00", commissionPercent: "10.00" };

const pkg = (patch: Partial<PackageLike> = {}): PackageLike => ({
  customerId: "c1",
  status: "ACTIVE",
  totalSessions: 5,
  usedSessions: 2,
  expiresAt: new Date("2026-12-01T00:00:00Z"),
  ...patch,
});

describe("package quotes", () => {
  it("adds the standard commission to the plan price", () => {
    expect(quotePackage({ price: "1895.00", sessionCount: 5 }, standard)).toMatchObject({
      basePrice: "1895.00",
      commissionPercent: "10.00",
      commissionAmount: "189.50",
      totalAmount: "2084.50",
      perSessionBase: "379.00",
      comparisonBase: "1995.00",
      savings: "100.00",
    });
  });

  it("makes no savings claim when the package isn't cheaper than standard sessions", () => {
    expect(quotePackage({ price: "399.00", sessionCount: 1 }, standard).savings).toBeNull();
    expect(quotePackage({ price: "4500.00", sessionCount: 10 }, standard).savings).toBeNull();
  });

  it("sets expiry from the payment time and validity", () => {
    expect(expiryFrom(NOW, 60).toISOString()).toBe("2026-12-18T04:30:00.000Z");
  });
});

describe("redemption rules", () => {
  const c = { customerId: "c1", startAt: SESSION, now: NOW };

  it("allows an active, unexpired package with sessions left", () => {
    expect(redemptionBlocker(pkg(), c)).toBeNull();
    expect(remainingSessions(pkg())).toBe(3);
  });

  it.each([
    ["another customer's package", pkg({ customerId: "c2" }), "NOT_OWNER"],
    ["an unpaid checkout", pkg({ status: "PENDING_PAYMENT" }), "NOT_PAID"],
    ["a discarded checkout", pkg({ status: "CANCELLED" }), "CANCELLED"],
    ["an exhausted package", pkg({ status: "EXHAUSTED", usedSessions: 5 }), "EXHAUSTED"],
    ["an active package with no sessions left", pkg({ usedSessions: 5 }), "EXHAUSTED"],
    ["an expired package", pkg({ expiresAt: new Date("2026-10-19T04:00:00Z") }), "EXPIRED"],
    ["a package expiring before the session", pkg({ expiresAt: new Date("2026-10-20T04:00:00Z") }), "EXPIRES_BEFORE_SESSION"],
    ["a package expiring exactly at the session start", pkg({ expiresAt: SESSION }), "EXPIRES_BEFORE_SESSION"],
  ] as const)("refuses %s", (_label, p, blocker) => {
    expect(redemptionBlocker(p, c)).toBe(blocker);
  });

  it("shows an active package past its expiry as expired", () => {
    expect(effectiveStatus(pkg({ expiresAt: NOW }), NOW)).toBe("EXPIRED");
    expect(effectiveStatus(pkg(), NOW)).toBe("ACTIVE");
  });
});

describe("coverage summary", () => {
  it("describes package, paid, refunded, declined and unpaid bookings from their records", () => {
    expect(coverageSummary({ status: "CONFIRMED", package: { name: "Starter Pack" } }).label).toBe(
      "1 session from Starter Pack",
    );
    expect(
      coverageSummary({
        status: "CANCELLED",
        package: { name: "Starter Pack" },
        packageEntries: [{ reason: "BOOKING_DEBIT" }, { reason: "CANCELLATION_REFUND" }],
      }).label,
    ).toBe("Session returned to Starter Pack");
    expect(coverageSummary({ status: "CONFIRMED", payments: [{ status: "SUCCEEDED", amount: "438.90" }] }).label).toBe(
      "Paid ₹438.90 (simulated)",
    );
    expect(coverageSummary({ status: "CANCELLED", payments: [{ status: "REFUNDED", amount: "438.90" }] }).tone).toBe(
      "muted",
    );
    expect(coverageSummary({ status: "FAILED", payments: [{ status: "FAILED", amount: "438.90" }] }).tone).toBe("danger");
    expect(coverageSummary({ status: "CONFIRMED", payments: [] }).label).toBe("No payment recorded");
  });
});

import { describe, expect, it } from "vitest";
import { WORKOUT_CATEGORIES } from "@/lib/validation/enums";
import { buildSeedPlan } from "../prisma/seed-data";

const ANCHOR = new Date("2026-10-19T04:30:00Z");

describe("seed plan", () => {
  const plan = buildSeedPlan(ANCHOR);

  it("is deterministic for a given day", () => {
    expect(buildSeedPlan(new Date("2026-10-19T12:00:00Z"))).toEqual(plan);
  });

  it("uses fixed, unique ids so re-running upserts instead of duplicating", () => {
    const ids = [
      ...plan.bookings,
      ...plan.availability,
      ...plan.payments,
      ...plan.sessions,
      ...plan.ledger,
      ...plan.notifications,
      ...plan.packages,
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("seed_"))).toBe(true);
    const refs = plan.bookings.map((b) => b.reference);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("meets the minimum demo population", () => {
    expect(plan.customers.length).toBeGreaterThanOrEqual(3);
    expect(plan.trainers.length).toBeGreaterThanOrEqual(3);
    expect(plan.sessions.length).toBeGreaterThanOrEqual(2);
  });

  it("only uses fictional, undeliverable email addresses", () => {
    const emails = [...plan.customers, ...plan.trainers, plan.operations].map((u) => u.email);
    expect(emails.every((e) => e.endsWith(".example"))).toBe(true);
  });

  it("prices every booking consistently with its peak flag", () => {
    for (const b of plan.bookings) {
      expect(b.totalAmount).toBe(b.isPeak ? "548.90" : "438.90");
    }
    expect(plan.bookings.some((b) => b.isPeak)).toBe(true);
    expect(plan.bookings.some((b) => !b.isPeak)).toBe(true);
  });

  it("keeps package balances equal to their ledger", () => {
    for (const p of plan.packages) {
      const net = plan.ledger.filter((e) => e.packageId === p.id).reduce((s, e) => s + e.delta, 0);
      expect(p.usedSessions).toBe(-net);
      expect(p.usedSessions).toBeLessThanOrEqual(p.totalSessions);
    }
  });

  it("prices packages as plan price + standard commission, each with a successful simulated payment", () => {
    expect(plan.packagePlans.map((p) => p.sessionCount)).toEqual([1, 5, 10]);
    for (const p of plan.packages) {
      const toPaise = (v: string) => Math.round(Number(v) * 100);
      expect(toPaise(p.pricePaid)).toBe(toPaise(p.basePrice) + toPaise(p.commissionAmount));
      const pay = plan.payments.find((x) => x.packageId === p.id);
      expect(pay?.status).toBe("SUCCEEDED");
      expect(pay?.amount).toBe(p.pricePaid);
      expect(p.expiresAt > p.purchasedAt).toBe(true);
    }
  });

  it("gives every payment exactly one target and a consistent breakdown", () => {
    for (const p of plan.payments) {
      expect([p.bookingId, p.packageId].filter(Boolean)).toHaveLength(1);
      const toPaise = (v: string) => Math.round(Number(v) * 100);
      expect(toPaise(p.amount)).toBe(toPaise(p.baseAmount) + toPaise(p.commissionAmount));
    }
  });

  it("records seeded sessions with a 60-minute deadline", () => {
    for (const s of plan.sessions) {
      expect(s.endsAt.getTime() - s.startedAt.getTime()).toBe(s.plannedMinutes * 60_000);
    }
  });

  it("never double-books a customer either", () => {
    const active = plan.bookings.filter((b) => !["CANCELLED", "COMPLETED", "FAILED"].includes(b.status));
    for (const a of active) {
      for (const b of active) {
        if (a.id >= b.id || a.customerId !== b.customerId) continue;
        expect(a.startAt < b.endAt && b.startAt < a.endAt, `${a.reference} overlaps ${b.reference}`).toBe(
          false,
        );
      }
    }
  });

  it("gives every trainer workout categories and only assigns trainers to workouts they coach", () => {
    for (const t of plan.trainers) expect(t.categories.length).toBeGreaterThan(0);
    for (const b of plan.bookings.filter((b) => b.trainerId)) {
      const trainer = plan.trainers.find((t) => t.id === b.trainerId)!;
      expect((trainer.categories as readonly string[]).includes(b.category), b.reference).toBe(true);
    }
  });

  it("offers every workout category in the main demo community", () => {
    const palmGrove = plan.trainers.filter((t) => t.zoneId === "seed_zone_palm_grove");
    const offered = new Set(palmGrove.flatMap((t) => [...t.categories]));
    expect([...offered].sort()).toEqual([...WORKOUT_CATEGORIES].sort());
  });

  it("opens availability for every trainer on each of the next seven days", () => {
    for (const t of plan.trainers) {
      const windows = plan.availability.filter((a) => a.trainerId === t.id && a.status === "AVAILABLE");
      expect(windows.length).toBe(14);
    }
  });

  it("never double-books a trainer", () => {
    const active = plan.bookings.filter((b) => b.trainerId && b.status !== "CANCELLED");
    for (const a of active) {
      for (const b of active) {
        if (a.id >= b.id || a.trainerId !== b.trainerId) continue;
        const overlap = a.startAt < b.endAt && b.startAt < a.endAt;
        expect(overlap, `${a.reference} overlaps ${b.reference}`).toBe(false);
      }
    }
  });
});

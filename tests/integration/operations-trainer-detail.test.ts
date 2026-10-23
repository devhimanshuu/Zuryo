import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getOperationsTrainerDetail } from "@/server/queries/operations-trainer-detail";
import { NOW, TOMORROW, ZONE, alice, arun, bob, createTestDb, ist, resetAndSeed } from "./helpers";

const db = createTestDb();
beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function booking(
  reference: string,
  customerId: string,
  startAt: Date,
  status: "COMPLETED" | "CANCELLED" | "CONFIRMED" | "PENDING",
) {
  return {
    reference,
    customerId,
    trainerId: arun.userId,
    serviceZoneId: ZONE,
    mode: "SCHEDULED" as const,
    status,
    startAt,
    endAt: new Date(startAt.getTime() + HOUR),
    workoutCategory: "STRENGTH" as const,
    pricingRuleId: "it_normal",
    isPeak: false,
    sessionPrice: "399.00",
    commissionPercent: "10.00",
    commissionAmount: "39.90",
    totalAmount: "438.90",
  };
}

describe("operations trainer detail", () => {
  it("returns the profile, lifetime figures, upcoming sessions and past session records", async () => {
    await db.booking.createMany({
      data: [
        booking("ITD-DONE", alice.userId, new Date(NOW.getTime() - 2 * DAY), "COMPLETED"),
        booking("ITD-CANCELLED", bob.userId, new Date(NOW.getTime() - DAY), "CANCELLED"),
        booking("ITD-MISSED", alice.userId, new Date(NOW.getTime() - 3 * HOUR), "PENDING"),
        booking("ITD-UP", bob.userId, ist(TOMORROW, "10:00"), "CONFIRMED"),
      ],
    });
    const done = await db.booking.findUniqueOrThrow({ where: { reference: "ITD-DONE" } });
    await db.sessionRecord.create({
      data: {
        bookingId: done.id,
        startedAt: new Date(done.startAt.getTime() + 2 * 60_000),
        endsAt: new Date(done.startAt.getTime() + 62 * 60_000),
        completedAt: new Date(done.startAt.getTime() + 62 * 60_000),
        completionSource: "TRAINER",
        trainerNotes: "Strong squat depth; keep elbows tucked.",
        customerFeedback: "Loved the pace.",
      },
    });

    const detail = await getOperationsTrainerDetail(arun.userId, NOW, db);
    expect(detail).not.toBeNull();
    expect(detail!.profile).toMatchObject({
      name: arun.name,
      email: `${arun.userId}@test.example`,
      isActive: true,
      zone: { name: "Test Residences", timezone: "Asia/Kolkata" },
      workoutCategories: ["STRENGTH", "MOBILITY"],
    });
    expect(detail!.stats).toEqual({
      total: 4,
      completed: 1,
      upcoming: 1,
      cancelled: 1,
      missed: 1,
      customers: 2,
      feedback: 1,
      notes: 1,
    });

    expect(detail!.upcoming.map((b) => b.reference)).toEqual(["ITD-UP"]);
    expect(detail!.upcoming[0]).toMatchObject({ customerName: bob.name, status: "CONFIRMED" });

    expect(detail!.history.map((b) => b.reference)).toEqual(["ITD-MISSED", "ITD-CANCELLED", "ITD-DONE"]);
    expect(detail!.history.at(-1)?.session).toMatchObject({
      trainerNotes: "Strong squat depth; keep elbows tucked.",
      customerFeedback: "Loved the pace.",
      completionSource: "TRAINER",
    });

    // Every seeded window that has not ended yet, soonest first.
    expect(detail!.availability.length).toBeGreaterThanOrEqual(3);
    expect(detail!.availability[0]?.status).toBe("AVAILABLE");
  });

  it("returns null for an unknown trainer", async () => {
    expect(await getOperationsTrainerDetail("it_missing", NOW, db)).toBeNull();
  });
});

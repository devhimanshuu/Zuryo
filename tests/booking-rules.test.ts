import { describe, expect, it } from "vitest";
import {
  checkTrainerFree,
  instantCandidateStarts,
  mergeIntervals,
  serviceDayStarts,
  startTimeProblem,
  type AvailabilityWindowLike,
  type BookingIntervalLike,
} from "@/lib/booking/availability";
import { cancellationBlocker } from "@/lib/booking/cancellation";
import {
  addDaysToKey,
  isOnSlotGrid,
  isValidDateKey,
  localDateKey,
  localMinuteOfDay,
  overlaps,
  zonedDayStart,
} from "@/lib/booking/time";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-10-19T04:30:00Z"); // Mon 10:00 IST
/** An instant on 2026-10-20 (Tue) at local HH:MM IST. */
const tue = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(zonedDayStart("2026-10-20", TZ).getTime() + (h * 60 + m) * 60_000);
};
const win = (
  from: string,
  to: string,
  status: "AVAILABLE" | "BLOCKED" = "AVAILABLE",
): AvailabilityWindowLike => ({
  startAt: tue(from),
  endAt: tue(to),
  status,
});
const booking = (from: string, status: BookingIntervalLike["status"] = "CONFIRMED"): BookingIntervalLike => ({
  startAt: tue(from),
  endAt: new Date(tue(from).getTime() + 3_600_000),
  status,
});

describe("zone-aware time helpers", () => {
  it("finds local midnight in IST as a UTC instant", () => {
    expect(zonedDayStart("2026-10-20", TZ).toISOString()).toBe("2026-10-19T18:30:00.000Z");
  });

  it("maps instants to the local calendar day, not the UTC one", () => {
    expect(localDateKey(new Date("2026-10-19T18:29:00Z"), TZ)).toBe("2026-10-19"); // 23:59 IST
    expect(localDateKey(new Date("2026-10-19T18:30:00Z"), TZ)).toBe("2026-10-20"); // 00:00 IST
    expect(localMinuteOfDay(tue("07:30"), TZ)).toBe(450);
  });

  it("handles month ends and rejects impossible dates", () => {
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2028-02-29")).toBe(true);
  });

  it("treats ranges as half-open so back-to-back sessions don't overlap", () => {
    expect(overlaps(tue("10:00"), tue("11:00"), tue("11:00"), tue("12:00"))).toBe(false);
    expect(overlaps(tue("10:00"), tue("11:00"), tue("10:30"), tue("11:30"))).toBe(true);
    expect(overlaps(tue("10:00"), tue("11:00"), tue("09:30"), tue("10:30"))).toBe(true);
    expect(overlaps(tue("10:00"), tue("12:00"), tue("10:30"), tue("11:00"))).toBe(true);
  });

  it("keeps IST half hours on the slot grid", () => {
    expect(isOnSlotGrid(tue("07:30"))).toBe(true);
    expect(isOnSlotGrid(tue("07:45"))).toBe(false);
  });
});

describe("trainer availability", () => {
  const schedule = (windows: AvailabilityWindowLike[], bookings: BookingIntervalLike[] = []) => ({
    windows,
    bookings,
  });

  it("accepts a session that fits entirely inside available time", () => {
    expect(checkTrainerFree(schedule([win("06:00", "12:00")]), tue("11:00"), tue("12:00"))).toEqual({
      free: true,
    });
  });

  it("rejects a session that runs past the end of availability", () => {
    expect(checkTrainerFree(schedule([win("06:00", "12:00")]), tue("11:30"), tue("12:30"))).toEqual({
      free: false,
      reason: "NO_AVAILABILITY",
    });
  });

  it("rejects a trainer with no availability at all", () => {
    expect(checkTrainerFree(schedule([]), tue("10:00"), tue("11:00"))).toMatchObject({
      reason: "NO_AVAILABILITY",
    });
  });

  it("joins touching windows so a session can span them", () => {
    expect(mergeIntervals([win("12:00", "14:00"), win("06:00", "12:00")])).toEqual([
      { startAt: tue("06:00"), endAt: tue("14:00") },
    ]);
    expect(
      checkTrainerFree(schedule([win("06:00", "12:00"), win("12:00", "14:00")]), tue("11:30"), tue("12:30"))
        .free,
    ).toBe(true);
  });

  it("rejects time the trainer blocked off, even partially", () => {
    const s = schedule([win("06:00", "12:00"), win("10:30", "11:00", "BLOCKED")]);
    expect(checkTrainerFree(s, tue("10:00"), tue("11:00"))).toMatchObject({ reason: "BLOCKED" });
    expect(checkTrainerFree(s, tue("11:00"), tue("12:00")).free).toBe(true);
  });

  it("rejects overlapping bookings, not just identical start times", () => {
    const s = schedule([win("06:00", "12:00")], [booking("10:00")]);
    expect(checkTrainerFree(s, tue("10:00"), tue("11:00"))).toMatchObject({ reason: "BOOKED" });
    expect(checkTrainerFree(s, tue("10:30"), tue("11:30"))).toMatchObject({ reason: "BOOKED" });
    expect(checkTrainerFree(s, tue("09:30"), tue("10:30"))).toMatchObject({ reason: "BOOKED" });
    expect(checkTrainerFree(s, tue("11:00"), tue("12:00")).free).toBe(true);
    expect(checkTrainerFree(s, tue("09:00"), tue("10:00")).free).toBe(true);
  });

  it("ignores cancelled, completed and failed bookings", () => {
    for (const status of ["CANCELLED", "COMPLETED", "FAILED"] as const) {
      const s = schedule([win("06:00", "12:00")], [booking("10:00", status)]);
      expect(checkTrainerFree(s, tue("10:00"), tue("11:00")).free, status).toBe(true);
    }
    for (const status of ["PENDING", "CONFIRMED", "IN_PROGRESS"] as const) {
      const s = schedule([win("06:00", "12:00")], [booking("10:00", status)]);
      expect(checkTrainerFree(s, tue("10:00"), tue("11:00")).free, status).toBe(false);
    }
  });
});

describe("slot timing rules", () => {
  it("draws the service-day grid from 06:00 to a last start at 20:00", () => {
    const starts = serviceDayStarts("2026-10-20", TZ);
    expect(starts[0]).toEqual(tue("06:00"));
    expect(starts.at(-1)).toEqual(tue("20:00"));
    expect(starts).toHaveLength(29);
  });

  it("offers instant starts between 15 and 60 minutes from now, on the grid", () => {
    expect(instantCandidateStarts(NOW).map((d) => d.toISOString())).toEqual([
      "2026-10-19T05:00:00.000Z", // 10:30 IST
      "2026-10-19T05:30:00.000Z", // 11:00 IST
    ]);
    // 10:20 IST: 10:30 is too soon (10 min), 11:00 is the earliest
    expect(instantCandidateStarts(new Date("2026-10-19T04:50:00Z"))[0]?.toISOString()).toBe(
      "2026-10-19T05:30:00.000Z",
    );
  });

  it("rejects past and too-soon scheduled slots and accepts later ones", () => {
    expect(startTimeProblem("SCHEDULED", new Date("2026-10-19T04:00:00Z"), NOW)).toMatch(/passed/);
    expect(startTimeProblem("SCHEDULED", new Date("2026-10-19T05:00:00Z"), NOW)).toMatch(/Instant/);
    expect(startTimeProblem("SCHEDULED", new Date("2026-10-19T06:00:00Z"), NOW)).toBeNull();
    expect(startTimeProblem("SCHEDULED", new Date("2026-12-01T06:00:00Z"), NOW)).toMatch(/30 days/);
  });

  it("only accepts instant slots inside the next hour", () => {
    expect(startTimeProblem("INSTANT", new Date("2026-10-19T05:00:00Z"), NOW)).toBeNull();
    expect(startTimeProblem("INSTANT", new Date("2026-10-19T06:00:00Z"), NOW)).toMatch(/next hour/);
  });
});

describe("cancellation rules", () => {
  const future = new Date("2026-10-20T04:30:00Z");
  it("allows cancelling a confirmed booking before it starts", () => {
    expect(cancellationBlocker({ status: "CONFIRMED", startAt: future }, NOW)).toBeNull();
    expect(cancellationBlocker({ status: "PENDING", startAt: future }, NOW)).toBeNull();
  });
  it.each([
    ["CANCELLED", future, /already cancelled/],
    ["COMPLETED", future, /Completed/],
    ["IN_PROGRESS", future, /in progress/],
    ["FAILED", future, /didn't go through/],
    ["CONFIRMED", NOW, /already started/],
  ] as const)("blocks %s bookings", (status, startAt, message) => {
    expect(cancellationBlocker({ status, startAt }, NOW)).toMatch(message);
  });
});

import { describe, expect, it } from "vitest";
import { TRAINERS, ZONES } from "../prisma/seed-data";
import {
  ARRIVAL_PREP_MINUTES,
  ARRIVE_EARLY_MINUTES,
  canArriveBy,
  estimateTravel,
  haversineKm,
  planTrip,
  toLatLng,
  tripPhase,
} from "@/lib/location/travel";

const T = (iso: string) => new Date(`2026-10-20T${iso}:00+05:30`);

describe("distance and travel estimates", () => {
  it("measures great-circle distance", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
    expect(haversineKm({ lat: 12.97, lng: 77.75 }, { lat: 12.97, lng: 77.75 })).toBe(0);
  });

  it("turns distance into an urban road estimate with arrival prep, in whole minutes", () => {
    // ~1.93 km straight → ~2.6 km by road → 7.1 min at 22 km/h → 8 + 5 min prep.
    const t = estimateTravel({ lat: 12.9698, lng: 77.75 }, { lat: 12.985, lng: 77.759 });
    expect(t.roadKm).toBe(2.6);
    expect(t.travelMinutes).toBe(8 + ARRIVAL_PREP_MINUTES);
    expect(Number.isInteger(t.travelMinutes)).toBe(true);
  });

  it("reads stored coordinates and refuses half or invalid pairs", () => {
    expect(toLatLng("12.969800", "77.750000")).toEqual({ lat: 12.9698, lng: 77.75 });
    expect(toLatLng(null, "77.75")).toBeNull();
    expect(toLatLng("abc", "77.75")).toBeNull();
  });

  it("checks whether a trainer setting out now arrives by the start", () => {
    const t = { roadKm: 6, travelMinutes: 23 };
    expect(canArriveBy(t, T("09:37"), T("10:00"))).toBe(true);
    expect(canArriveBy(t, T("09:38"), T("10:00"))).toBe(false);
  });
});

describe("trip plan and simulated progress", () => {
  const travel = { roadKm: 2.7, travelMinutes: 13 };

  it("plans to arrive a few minutes early", () => {
    const trip = planTrip(travel, T("10:00"), T("08:00"));
    expect(trip.arriveBy).toEqual(new Date(T("10:00").getTime() - ARRIVE_EARLY_MINUTES * 60_000));
    expect(trip.departAt).toEqual(T("09:42"));
  });

  it("leaves when booked if that's later than the plan (an instant booking)", () => {
    const trip = planTrip(travel, T("10:00"), T("09:45"));
    expect(trip.departAt).toEqual(T("09:45"));
    expect(trip.arriveBy).toEqual(T("09:58"));
  });

  it("is planned, then on the way with shrinking distance, then arrived", () => {
    const trip = planTrip(travel, T("10:00"), T("08:00")); // 09:42 → 09:55
    expect(tripPhase(trip, T("09:30"))).toEqual({ phase: "PLANNED" });
    const mid = tripPhase(trip, new Date(T("09:42").getTime() + 6.5 * 60_000));
    expect(mid.phase).toBe("EN_ROUTE");
    if (mid.phase === "EN_ROUTE") {
      expect(mid.progress).toBeCloseTo(0.5, 2);
      expect(mid.remainingKm).toBeCloseTo(1.4, 1);
      expect(mid.minutesLeft).toBe(7);
    }
    expect(tripPhase(trip, T("09:55"))).toEqual({ phase: "ARRIVED" });
  });
});

describe("seeded trainer locations", () => {
  const zone = (id: string) => ZONES.find((z) => z.id === id)!;
  const trip = (t: (typeof TRAINERS)[number]) => {
    const z = zone(t.zoneId);
    return estimateTravel(toLatLng(t.base.latitude, t.base.longitude)!, toLatLng(z.latitude, z.longitude)!);
  };

  it("puts every trainer within a realistic trip of the community they serve", () => {
    for (const t of TRAINERS) {
      expect(trip(t).roadKm, t.name).toBeGreaterThan(0.5);
      expect(trip(t).travelMinutes, t.name).toBeLessThanOrEqual(45);
    }
  });

  it("spreads Palm Grove's trainers so distance changes who is nearest", () => {
    const minutes = (id: string) => trip(TRAINERS.find((t) => t.id === id)!).travelMinutes;
    expect(minutes("seed_user_arjun")).toBeLessThan(minutes("seed_user_kavya"));
    expect(minutes("seed_user_kavya")).toBeLessThan(minutes("seed_user_sana"));
    // Arjun can make the earliest instant start (now + 15 min); Sana can't.
    expect(minutes("seed_user_arjun")).toBeLessThanOrEqual(15);
    expect(minutes("seed_user_sana")).toBeGreaterThan(15);
  });
});

import { addMinutes } from "@/lib/booking/time";

/**
 * Simulated location and travel rules. There is no live GPS in this product: each trainer has a
 * seeded base location (where they set out from) and each community has seeded coordinates (where
 * the session happens). Distances are great-circle, turned into an urban road estimate. The numbers
 * are deliberately simple and live here, so a routing API can replace `estimateTravel` later
 * without touching matching or the UI.
 */
export type LatLng = { lat: number; lng: number };

/** Roads are longer than the straight line; ~1.35× is typical for dense Indian city grids. */
export const ROAD_DISTANCE_FACTOR = 1.35;
/** Average door-to-door urban speed by scooter or car, including signals. */
export const CITY_SPEED_KMH = 22;
/** Parking, the society gate, and walking to the gym, lawn or terrace. */
export const ARRIVAL_PREP_MINUTES = 5;
/** Trainers plan to arrive this long before the session starts. */
export const ARRIVE_EARLY_MINUTES = 5;

export type TravelEstimate = {
  /** Estimated road distance, one decimal. */
  roadKm: number;
  /** Door to door, including arrival prep; always a whole number of minutes. */
  travelMinutes: number;
};

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateTravel(from: LatLng, to: LatLng): TravelEstimate {
  const roadKm = haversineKm(from, to) * ROAD_DISTANCE_FACTOR;
  return {
    roadKm: Math.round(roadKm * 10) / 10,
    travelMinutes: Math.ceil((roadKm / CITY_SPEED_KMH) * 60) + ARRIVAL_PREP_MINUTES,
  };
}

/** A pair of stored coordinates (Prisma Decimals or strings), or null when either is missing. */
export function toLatLng(
  lat: { toString(): string } | null | undefined,
  lng: { toString(): string } | null | undefined,
): LatLng | null {
  if (lat == null || lng == null) return null;
  const point = { lat: Number(lat.toString()), lng: Number(lng.toString()) };
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) ? point : null;
}

/** Whether a trainer setting out at `departFrom` can be there by `startAt`. */
export function canArriveBy(travel: TravelEstimate, departFrom: Date, startAt: Date): boolean {
  return addMinutes(departFrom, travel.travelMinutes) <= startAt;
}

export type TripPlan = TravelEstimate & { departAt: Date; arriveBy: Date };

/**
 * When the trainer sets out and arrives for a session. They aim to arrive ARRIVE_EARLY_MINUTES
 * before the start; if the booking was made too late for that (an instant booking), they leave the
 * moment it was booked and arrive one travel time later.
 */
export function planTrip(travel: TravelEstimate, startAt: Date, bookedAt?: Date): TripPlan {
  const plannedDepart = addMinutes(startAt, -(ARRIVE_EARLY_MINUTES + travel.travelMinutes));
  const departAt = bookedAt && bookedAt > plannedDepart ? bookedAt : plannedDepart;
  return { ...travel, departAt, arriveBy: addMinutes(departAt, travel.travelMinutes) };
}

export type TripPhase =
  | { phase: "PLANNED" }
  | { phase: "EN_ROUTE"; remainingKm: number; minutesLeft: number; progress: number }
  | { phase: "ARRIVED" };

/** Where the simulated trainer is at `now`: not yet left, on the way (linear progress), or there. */
export function tripPhase(trip: Pick<TripPlan, "roadKm" | "departAt" | "arriveBy">, now: Date): TripPhase {
  if (now < trip.departAt) return { phase: "PLANNED" };
  if (now >= trip.arriveBy) return { phase: "ARRIVED" };
  const total = trip.arriveBy.getTime() - trip.departAt.getTime();
  const progress = (now.getTime() - trip.departAt.getTime()) / total;
  return {
    phase: "EN_ROUTE",
    progress,
    remainingKm: Math.max(0.1, Math.round(trip.roadKm * (1 - progress) * 10) / 10),
    minutesLeft: Math.max(1, Math.ceil((trip.arriveBy.getTime() - now.getTime()) / 60_000)),
  };
}

/** "2.6 km · about 13 min" — the one way distance and travel time are written everywhere. */
export function describeTravel(t: TravelEstimate): string {
  return `${t.roadKm.toFixed(1)} km · about ${t.travelMinutes} min`;
}

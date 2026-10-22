import "server-only";
import { estimateTravel, planTrip, toLatLng } from "@/lib/location/travel";

type Coord = { toString(): string } | null | undefined;
type TrainerLocation = { baseLatitude: Coord; baseLongitude: Coord };

/** A trip as the browser may see it: derived distance and times only, never the trainer's base. */
export type TripView = { roadKm: number; travelMinutes: number; departAt: string; arriveBy: string };

/**
 * The simulated trip for one booking: from the assigned trainer's base to the community, planned to
 * arrive a few minutes early (or, for a booking made at short notice, leaving when it was booked).
 * Null when the trainer or the community has no coordinates.
 */
export function tripForBooking(b: {
  startAt: Date;
  createdAt: Date;
  trainer?: TrainerLocation | null;
  serviceZone: { latitude: Coord; longitude: Coord };
}): TripView | null {
  const from = b.trainer ? toLatLng(b.trainer.baseLatitude, b.trainer.baseLongitude) : null;
  const to = toLatLng(b.serviceZone.latitude, b.serviceZone.longitude);
  if (!from || !to) return null;
  const trip = planTrip(estimateTravel(from, to), b.startAt, b.createdAt);
  return {
    roadKm: trip.roadKm,
    travelMinutes: trip.travelMinutes,
    departAt: trip.departAt.toISOString(),
    arriveBy: trip.arriveBy.toISOString(),
  };
}

type WithoutLocation<T> = T extends TrainerLocation ? Omit<T, keyof TrainerLocation> : T;

/**
 * A booking read for a page: the derived `trip` attached and the trainer's coordinates removed, so
 * no page, prop or serialised payload ever holds them.
 */
export function withTrip<
  B extends {
    startAt: Date;
    createdAt: Date;
    trainer: TrainerLocation | null;
    serviceZone: { latitude: Coord; longitude: Coord };
  },
>(
  b: B,
): Omit<B, "trainer"> & {
  trainer: WithoutLocation<NonNullable<B["trainer"]>> | null;
  trip: TripView | null;
} {
  const trip = tripForBooking(b);
  let trainer: WithoutLocation<NonNullable<B["trainer"]>> | null = null;
  if (b.trainer) {
    const rest: Record<string, unknown> = { ...b.trainer };
    delete rest.baseLatitude;
    delete rest.baseLongitude;
    trainer = rest as WithoutLocation<NonNullable<B["trainer"]>>;
  }
  return { ...b, trainer, trip };
}

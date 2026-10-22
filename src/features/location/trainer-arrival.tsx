"use client";

import { Car, MapPin, Navigation } from "lucide-react";
import { useEffect, useState } from "react";
import { tripPhase } from "@/lib/location/travel";
import { cn } from "@/lib/utils/cn";
import { formatSlot, formatTime } from "@/lib/utils/format";
import type { TripView } from "@/server/location/trip";

/**
 * The customer's view of their trainer's (simulated) journey: when they set out, how far they are
 * and when they should arrive. Recomputed every 15 s on the server's clock. Only derived figures
 * reach the browser; the trainer's base location stays on the server.
 */
export function TrainerArrival({
  trip,
  trainerName,
  zoneName,
  serverNow,
  tz,
  inverse,
}: {
  trip: TripView;
  trainerName: string;
  zoneName: string;
  serverNow: string;
  tz: string;
  inverse?: boolean;
}) {
  // Null until mounted, so server HTML and hydration agree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const tick = () => setNow(new Date(Date.now() + offset));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [serverNow]);

  const departAt = new Date(trip.departAt);
  const arriveBy = new Date(trip.arriveBy);
  const state = now
    ? tripPhase({ roadKm: trip.roadKm, departAt, arriveBy }, now)
    : { phase: "PLANNED" as const };
  const first = trainerName.split(" ")[0];
  const sameDay = now !== null && departAt.getTime() - now.getTime() < 12 * 60 * 60_000;
  const muted = inverse ? "text-ink-inverse/70" : "text-ink-muted";
  const progress = state.phase === "EN_ROUTE" ? state.progress : state.phase === "ARRIVED" ? 1 : 0;

  return (
    <div className="grid gap-3" aria-live="polite">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-md",
            inverse ? "bg-ink-inverse/10 text-success-inverse" : "bg-info-soft text-info",
          )}
          aria-hidden
        >
          {state.phase === "EN_ROUTE" ? (
            <Navigation className="size-4" />
          ) : state.phase === "ARRIVED" ? (
            <MapPin className="size-4" />
          ) : (
            <Car className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">
            {state.phase === "EN_ROUTE"
              ? `${first} is on the way · ${state.remainingKm.toFixed(1)} km away`
              : state.phase === "ARRIVED"
                ? `${first} has arrived at ${zoneName}`
                : `${first} sets out around ${sameDay ? formatTime(departAt, tz) : formatSlot(departAt, tz)}`}
          </p>
          <p className={cn("text-body-sm", muted)}>
            {state.phase === "EN_ROUTE"
              ? `Arriving in about ${state.minutesLeft} min, by ${formatTime(arriveBy, tz)}`
              : state.phase === "ARRIVED"
                ? "Your session starts at the booked time."
                : `${trip.roadKm.toFixed(1)} km · about ${trip.travelMinutes} min · arrives by ${formatTime(arriveBy, tz)}`}
          </p>
        </div>
      </div>
      <div
        className={cn("relative h-1.5 rounded-full", inverse ? "bg-ink-inverse/15" : "bg-sunken")}
        role="progressbar"
        aria-label="Trainer's journey"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", inverse ? "bg-success-inverse" : "bg-info")}
          style={{ width: `${progress * 100}%` }}
        />
        <span
          className={cn(
            "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2",
            inverse ? "bg-success-inverse ring-inverse" : "bg-info ring-raised",
          )}
          style={{ left: `${progress * 100}%` }}
          aria-hidden
        />
      </div>
      <p className={cn("text-[12px]", inverse ? "text-ink-inverse/55" : "text-ink-subtle")}>
        Simulated location: estimated from the trainer&apos;s base and your community. No device is tracked.
      </p>
    </div>
  );
}

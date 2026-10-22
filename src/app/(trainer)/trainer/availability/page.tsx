import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { AvailabilityForm } from "@/features/trainers/availability-form";
import { RemoveWindowButton } from "@/features/trainers/remove-window-button";
import { categoryLabel } from "@/lib/booking/categories";
import { BOOKING_HORIZON_DAYS } from "@/lib/booking/rules";
import { addDaysToKey, localDateKey, overlaps, zonedDayStart } from "@/lib/booking/time";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_TZ, formatDay, formatTime } from "@/lib/utils/format";
import { safely } from "@/lib/utils/errors";
import { getActor } from "@/server/auth/actor";
import { getTrainerWeek } from "@/server/queries/trainer";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const tz = DEFAULT_TZ;
  const now = new Date();
  const todayKey = localDateKey(now, tz);
  const keys = Array.from({ length: BOOKING_HORIZON_DAYS }, (_, i) => addDaysToKey(todayKey, i));
  const from = zonedDayStart(todayKey, tz);
  const to = zonedDayStart(addDaysToKey(todayKey, BOOKING_HORIZON_DAYS), tz);
  const actor = await getActor("TRAINER");
  const result = await safely(() => getTrainerWeek(actor.userId, from, to));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { availability, bookings } = result.data;

  const days = keys.map((key) => {
    const start = zonedDayStart(key, tz);
    const end = zonedDayStart(addDaysToKey(key, 1), tz);
    return {
      key,
      start,
      intervals: availability.filter((a) => a.startAt < end && a.endAt > start),
      bookings: bookings.filter((b) => b.startAt >= start && b.startAt < end),
    };
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Availability"
        description={`Customers can only book ${actor.name.split(" ")[0]} inside available time. The next ${BOOKING_HORIZON_DAYS} days, in IST.`}
        className="pb-0"
      />
      <AvailabilityForm days={days.map((d) => ({ key: d.key, label: formatDay(d.start, tz) }))} />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d) => (
          <li
            key={d.key}
            className={cn(
              "rounded-lg border bg-raised p-4 shadow-(--shadow-1)",
              d.key === todayKey ? "border-brand/40 ring-1 ring-brand/20" : "border-hairline",
            )}
          >
            <p className="flex items-center justify-between gap-2 font-semibold">
              {formatDay(d.start, tz)}
              {d.key === todayKey ? (
                <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-on-brand">
                  Today
                </span>
              ) : null}
            </p>
            <ul className="mt-3 grid gap-2">
              {d.intervals.length === 0 ? (
                <li className="text-body-sm text-ink-muted">
                  No availability set, so nothing can be booked.
                </li>
              ) : null}
              {d.intervals.map((a) => {
                const booked =
                  a.status === "AVAILABLE" &&
                  bookings.some((b) => overlaps(b.startAt, b.endAt, a.startAt, a.endAt));
                const removable = a.endAt > now && !booked;
                const label = `${a.status === "AVAILABLE" ? "available" : "blocked"} time ${formatTime(a.startAt, tz)} to ${formatTime(a.endAt, tz)}`;
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md py-1.5 pr-1.5 pl-3 text-body-sm",
                      a.status === "AVAILABLE" ? "bg-brand-soft text-brand" : "bg-sunken text-ink-muted",
                    )}
                  >
                    <span className="font-semibold tabular">
                      {formatTime(a.startAt, tz)} – {formatTime(a.endAt, tz)}
                    </span>
                    <span className="ml-auto truncate">
                      {a.status === "AVAILABLE"
                        ? booked
                          ? "Available · has bookings"
                          : "Available"
                        : (a.note ?? "Blocked")}
                    </span>
                    {removable ? (
                      <RemoveWindowButton availabilityId={a.id} label={label} />
                    ) : (
                      <span className="size-8" aria-hidden />
                    )}
                  </li>
                );
              })}
              {d.bookings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-hairline px-3 py-2 text-body-sm"
                >
                  <span className="font-semibold tabular">{formatTime(b.startAt, tz)}</span>
                  <span className="truncate text-ink-muted">
                    Booked · {b.customer.user.name} · {categoryLabel(b.workoutCategory)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

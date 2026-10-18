import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, PhaseNote } from "@/components/shared/states";
import { safely } from "@/lib/utils/errors";
import { formatDay, formatTime } from "@/lib/utils/format";
import { addDays, istMidnight } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { DEMO_PERSONAS } from "@/server/demo";
import { getTrainerWeek } from "@/server/queries/trainer";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const from = istMidnight(new Date());
  const to = addDays(from, 7);
  const result = await safely(() => getTrainerWeek(DEMO_PERSONAS.TRAINER.userId, from, to));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { availability, bookings } = result.data;

  const days = Array.from({ length: 7 }, (_, i) => {
    const start = addDays(from, i);
    const end = addDays(start, 1);
    return {
      start,
      intervals: availability.filter((a) => a.startAt < end && a.endAt > start),
      bookings: bookings.filter((b) => b.startAt >= start && b.startAt < end),
    };
  });

  return (
    <div>
      <PageHeader title="Availability" description="The next seven days. Times in IST." />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d) => (
          <li key={d.start.toISOString()} className="rounded-lg border border-hairline bg-raised p-4">
            <p className="font-semibold">{formatDay(d.start)}</p>
            <ul className="mt-3 grid gap-2">
              {d.intervals.length === 0 ? (
                <li className="text-body-sm text-ink-muted">No availability set</li>
              ) : null}
              {d.intervals.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2 text-body-sm",
                    a.status === "AVAILABLE" ? "bg-brand-soft text-brand" : "bg-sunken text-ink-muted",
                  )}
                >
                  <span className="font-semibold tabular">
                    {formatTime(a.startAt)} – {formatTime(a.endAt)}
                  </span>
                  <span>{a.status === "AVAILABLE" ? "Available" : (a.note ?? "Blocked")}</span>
                </li>
              ))}
              {d.bookings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-md border border-hairline px-3 py-2 text-body-sm"
                >
                  <span className="font-semibold tabular">{formatTime(b.startAt)}</span>
                  <span className="truncate text-ink-muted">Booked · {b.customer.user.name}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <PhaseNote>
          Adding and removing availability, with conflict checks against existing bookings.
        </PhaseNote>
      </div>
    </div>
  );
}

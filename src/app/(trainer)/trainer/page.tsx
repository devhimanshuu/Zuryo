import { ArrowRight, Bell, CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Metric } from "@/components/shared/metric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleRow } from "@/features/bookings/schedule-row";
import { categoryLabel } from "@/lib/booking/categories";
import { safely } from "@/lib/utils/errors";
import { formatDay, formatSlot, formatTime } from "@/lib/utils/format";
import { addDays, istMidnight } from "@/lib/utils/time";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import { getTrainerOverview } from "@/server/queries/trainer";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "Trainer overview" };

export default async function TrainerOverviewPage() {
  const now = new Date();
  const dayStart = istMidnight(now);
  const actor = await getActor("TRAINER");
  const result = await safely(async () => {
    await reconcileDueSessions(defaultDeps(), { trainerId: actor.userId });
    return getTrainerOverview(actor.userId, dayStart, addDays(dayStart, 1));
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { profile, today, upcoming, notifications } = result.data;
  const next = [...today, ...upcoming].find((b) => b.endAt > now && b.status !== "COMPLETED");
  const live = today.find((b) => b.status === "IN_PROGRESS");

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={formatDay(now)}
        title={`Today, ${actor.name.split(" ")[0]}`}
        description={
          profile ? `${profile.serviceZone.name} · ${profile.specializations.join(", ")}` : undefined
        }
        className="pb-0"
      />

      {live ? (
        <Link
          href={`/trainer/sessions/${live.id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-inverse px-5 py-4 text-ink-inverse hover:opacity-95"
        >
          <span>
            <span className="block text-eyebrow font-semibold tracking-[0.08em] text-ink-inverse/70 uppercase">
              Session in progress
            </span>
            <span className="block font-semibold">
              {live.customer.user.name} · {categoryLabel(live.workoutCategory)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold">
            Open live session <ArrowRight className="size-4" aria-hidden />
          </span>
        </Link>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Sessions today" value={today.length} />
        <Metric
          label="Next session"
          value={next ? formatTime(next.startAt) : "—"}
          foot={next ? next.customer.user.name : "Nothing scheduled"}
        />
        <Metric label="Upcoming (later)" value={upcoming.length} foot="Confirmed or pending" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s schedule</CardTitle>
            <CalendarDays className="size-5 text-ink-subtle" aria-hidden />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {today.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {today.map((b) => (
                  <ScheduleRow
                    key={b.id}
                    startAt={b.startAt}
                    status={b.status}
                    title={`${b.customer.user.name} · ${categoryLabel(b.workoutCategory)}`}
                    subtitle={`${b.serviceZone.name}${b.customer.addressLine ? `, ${b.customer.addressLine.split(",")[0]}` : ""}`}
                  />
                ))}
              </ul>
            ) : (
              <div className="px-5 pb-3">
                <EmptyState title="No sessions today" body="Sessions assigned to you will appear here." />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Booking updates</CardTitle>
            <Bell className="size-5 text-ink-subtle" aria-hidden />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {notifications.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {notifications.map((n) => (
                  <li key={n.id} className="flex gap-3 px-5 py-3">
                    <span
                      className={
                        n.readAt
                          ? "mt-2 size-2 shrink-0 rounded-full bg-transparent"
                          : "mt-2 size-2 shrink-0 rounded-full bg-brand"
                      }
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {!n.readAt ? <span className="sr-only">Unread: </span> : null}
                        {n.title}
                      </p>
                      <p className="text-body-sm text-ink-muted">{n.message}</p>
                      <p className="mt-0.5 text-body-sm text-ink-subtle">{formatSlot(n.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-3 text-ink-muted">No updates.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <ul className="divide-y divide-hairline">
              {upcoming.map((b) => (
                <ScheduleRow
                  key={b.id}
                  showDay
                  startAt={b.startAt}
                  status={b.status}
                  title={`${b.customer.user.name} · ${categoryLabel(b.workoutCategory)}`}
                  subtitle={b.serviceZone.name}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}

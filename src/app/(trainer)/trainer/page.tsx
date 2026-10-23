import { ArrowRight, Bell, CalendarClock, CalendarDays, CalendarRange, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Metric } from "@/components/shared/metric";
import { Card, CardContent, CardHeader, CardIcon, CardLink, CardTitle } from "@/components/ui/card";
import { ScheduleRow } from "@/features/bookings/schedule-row";
import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";
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
  const { profile, today, upcoming, upcomingCount, notifications, setup } = result.data;
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

      <OnboardingChecklist
        storageKey={`zuryofit-trainer-onboarding:${actor.userId}`}
        title={`Set up your week, ${actor.name.split(" ")[0]}`}
        description="Open time, meet your first customer and close the loop with notes."
        steps={[
          {
            id: "availability",
            title: "Open your availability",
            body: "Customers can only book the hours you publish.",
            href: "/trainer/availability",
            done: setup.availabilityCount > 0,
          },
          {
            id: "first-session",
            title: "Get your first session",
            body: "Assigned sessions appear in your schedule and updates.",
            href: "/trainer/sessions",
            done: setup.assignedCount > 0,
          },
          {
            id: "complete",
            title: "Complete a session",
            body: "Start and finish a live session from its detail page.",
            href: "/trainer/sessions?tab=completed",
            done: setup.completedCount > 0,
          },
          {
            id: "notes",
            title: "Add notes after a session",
            body: "Notes and a next workout help customers keep momentum.",
            href: "/trainer/sessions?tab=completed",
            done: setup.notesCount > 0,
          },
        ]}
      />

      {live ? (
        <Link
          href={`/trainer/sessions/${live.id}`}
          className="group relative isolate flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-lg bg-inverse px-5 py-5 text-ink-inverse shadow-(--shadow-3) sm:px-6"
        >
          <span
            aria-hidden
            className="absolute -top-16 -right-10 -z-10 size-56 rounded-full bg-accent/30 blur-3xl"
          />
          <span className="flex items-center gap-4">
            <span className="relative flex size-3" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative size-3 rounded-full bg-accent" />
            </span>
            <span>
              <span className="block text-eyebrow font-semibold tracking-[0.08em] text-ink-inverse/70 uppercase">
                Session in progress
              </span>
              <span className="block text-heading-md font-semibold">
                {live.customer.user.name} · {categoryLabel(live.workoutCategory)}
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-ink-inverse px-3 py-2 text-sm font-semibold text-ink">
            Open live session{" "}
            <ArrowRight
              className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </Link>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Sessions today" value={today.length} icon={CalendarDays} />
        <Metric
          label="Next session"
          value={next ? formatTime(next.startAt) : "—"}
          foot={next ? next.customer.user.name : "Nothing scheduled"}
          icon={Clock}
          tone="accent"
        />
        <Metric
          label="Upcoming (later)"
          value={upcomingCount}
          foot="Confirmed or pending"
          icon={CalendarRange}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s schedule</CardTitle>
            <CardIcon icon={CalendarDays} />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {today.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {today.map((b) => (
                  <ScheduleRow
                    key={b.id}
                    href={`/trainer/sessions/${b.id}`}
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
            <CardIcon icon={Bell} />
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
            <div className="border-t border-hairline px-5 pt-3 pb-1">
              <CardLink href="/trainer/notifications">All updates</CardLink>
            </div>
          </CardContent>
        </Card>
      </div>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
            <CardIcon icon={CalendarClock} />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <ul className="divide-y divide-hairline">
              {upcoming.map((b) => (
                <ScheduleRow
                  key={b.id}
                  href={`/trainer/sessions/${b.id}`}
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

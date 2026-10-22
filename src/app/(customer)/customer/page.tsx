import {
  ArrowRight,
  Bell,
  CalendarClock,
  ClipboardCheck,
  MapPin,
  NotebookPen,
  Package,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/shared/avatar";
import { DateTile } from "@/components/shared/date-tile";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardIcon,
  CardLink,
  CardTitle,
} from "@/components/ui/card";
import { PackageMeter } from "@/features/customers/package-meter";
import { TrainerArrival } from "@/features/location/trainer-arrival";
import { LiveSessionStatus } from "@/features/sessions/live-session-status";
import { categoryLabel } from "@/lib/booking/categories";
import { coverageSummary } from "@/lib/payments/coverage";
import { formatINR } from "@/lib/pricing";
import { safely } from "@/lib/utils/errors";
import { DEFAULT_TZ, formatDay, formatTime, greeting, relativeDay, titleCase } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import { getCustomerHome } from "@/server/queries/customer";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "Home" };

export default async function CustomerHomePage() {
  const actor = await getActor("CUSTOMER");
  const result = await safely(async () => {
    await reconcileDueSessions(defaultDeps(), { customerId: actor.userId });
    return getCustomerHome(actor.userId);
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { profile, upcoming, recent, pkg, unread } = result.data;
  if (!profile)
    return <ErrorState title="Demo customer not found" message="Run npm run db:seed to create demo data." />;

  const firstName = profile.user.name.split(" ")[0];
  const next = upcoming[0];
  const nextTrip = next?.status === "CONFIRMED" ? next.trip : null;

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-body-sm font-semibold text-ink-muted">
            <MapPin className="size-4 text-brand" aria-hidden /> {profile.serviceZone.name}
          </p>
          <h1 className="mt-1 font-display text-display-md">
            {greeting()}, {firstName}
          </h1>
        </div>
        {unread > 0 ? (
          <Link
            href="/customer/notifications"
            className="inline-flex items-center gap-2 rounded-full border border-brand/15 bg-brand-soft px-3 py-1.5 text-body-sm font-semibold text-brand transition-colors hover:border-brand/30"
          >
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-50" />
              <span className="relative size-2 rounded-full bg-brand" />
            </span>
            <Bell className="size-4" aria-hidden /> {unread} unread update{unread === 1 ? "" : "s"}
          </Link>
        ) : null}
      </header>

      <section aria-labelledby="next-heading" className="grid gap-4">
        {next ? (
          <article className="relative isolate overflow-hidden rounded-lg bg-inverse p-5 text-ink-inverse shadow-(--shadow-3) sm:p-7">
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <div className="absolute inset-0 bg-dot-grid fade-radial text-ink-inverse/[0.06]" />
              <div className="absolute -top-24 -right-16 size-80 rounded-full bg-brand/60 blur-3xl" />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 gap-4">
                <DateTile date={next.startAt} inverse className="self-start" />
                <div className="min-w-0">
                  <h2
                    id="next-heading"
                    className="text-eyebrow font-semibold tracking-[0.08em] text-ink-inverse/60 uppercase"
                  >
                    Your next session ·{" "}
                    {next.status === "IN_PROGRESS"
                      ? "happening now"
                      : relativeDay(next.startAt).toLowerCase()}
                  </h2>
                  <p className="mt-1.5 font-display text-[1.75rem] leading-tight sm:text-display-md">
                    {formatTime(next.startAt)} · {categoryLabel(next.workoutCategory)}
                  </p>
                  <p className="mt-1 text-ink-inverse/75">
                    {formatDay(next.startAt)} · {next.serviceZone.name}
                  </p>
                </div>
              </div>
              <StatusBadge status={next.status} rescheduled={next.rescheduleCount > 0} />
            </div>
            {next.status === "IN_PROGRESS" && next.sessionRecord && !next.sessionRecord.completedAt ? (
              <div className="mt-6">
                <LiveSessionStatus
                  inverse
                  startedAt={next.sessionRecord.startedAt.toISOString()}
                  endsAt={next.sessionRecord.endsAt.toISOString()}
                  serverNow={new Date().toISOString()}
                  tz={DEFAULT_TZ}
                />
              </div>
            ) : null}
            {nextTrip && next.trainer ? (
              <div className="mt-6 rounded-md border border-ink-inverse/10 bg-ink-inverse/[0.04] p-4">
                <TrainerArrival
                  inverse
                  trip={nextTrip}
                  trainerName={next.trainer.user.name}
                  zoneName={next.serviceZone.name}
                  serverNow={new Date().toISOString()}
                  tz={DEFAULT_TZ}
                />
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ink-inverse/10 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                {next.trainer ? (
                  <Avatar name={next.trainer.user.name} tone="inverse" />
                ) : (
                  <span
                    className="grid size-10 place-items-center rounded-full bg-ink-inverse/10"
                    aria-hidden
                  >
                    <UserRound className="size-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {next.trainer ? next.trainer.user.name : "Awaiting trainer assignment"}
                  </p>
                  <p className="text-body-sm text-ink-inverse/70">
                    {next.reference} · {coverageSummary(next).label} · {formatINR(next.totalAmount)}
                  </p>
                </div>
              </div>
              <Button asChild variant="inverse" size="sm" className="group">
                <Link href={`/customer/bookings/${next.id}`}>
                  View details{" "}
                  <ArrowRight
                    className="transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </Button>
            </div>
          </article>
        ) : (
          <>
            <h2 id="next-heading" className="text-heading-md font-semibold">
              Your next session
            </h2>
            <EmptyState
              title="No upcoming sessions"
              body="When you book a trainer, your next session shows up here."
            />
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <QuickAction
            href="/customer/bookings/new?mode=instant"
            icon={Zap}
            tone="accent"
            title="Train within the hour"
            body="Zuryo finds a trainer nearby who can start in the next 60 minutes."
          />
          <QuickAction
            href="/customer/bookings/new?mode=scheduled"
            icon={CalendarClock}
            tone="brand"
            title="Schedule a session"
            body="Pick a day and a 60-minute slot up to a month ahead."
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Package</CardTitle>
            <CardIcon icon={Package} />
          </CardHeader>
          <CardContent>
            {pkg ? (
              <div className="grid gap-4">
                <PackageMeter name={pkg.name} total={pkg.totalSessions} used={pkg.usedSessions} />
                <CardLink href="/customer/packages">Usage history and packages</CardLink>
              </div>
            ) : (
              <div className="grid gap-3">
                <p className="text-ink-muted">No active package. You pay per session.</p>
                <CardLink href="/customer/packages">See packages</CardLink>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fitness profile</CardTitle>
            <CardIcon icon={ClipboardCheck} />
          </CardHeader>
          <CardContent className="grid gap-4">
            {profile.assessedAt ? (
              <>
                <div className="grid gap-2">
                  <p className="text-body-sm text-ink-muted">Level</p>
                  <p className="font-semibold">
                    {profile.fitnessLevel ? titleCase(profile.fitnessLevel) : "Level not set"}
                  </p>
                  {profile.fitnessGoals.length > 0 ? (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {profile.fitnessGoals.map((g) => (
                        <li
                          key={g}
                          className="rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-body-sm"
                        >
                          {titleCase(g)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <CardLink href="/customer/fitness">View profile and history</CardLink>
              </>
            ) : (
              <>
                <p className="text-ink-muted">Assessment not completed yet.</p>
                <CardLink href="/customer/fitness">Set up your profile</CardLink>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
            <CardIcon icon={NotebookPen} />
          </CardHeader>
          <CardContent>
            {recent.length > 0 ? (
              <ul className="grid gap-3">
                {recent.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/customer/bookings/${b.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-sunken"
                    >
                      <Avatar name={b.trainer?.user.name ?? "Trainer"} size="sm" tone="neutral" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{formatDay(b.startAt)}</span>
                        <span className="block truncate text-body-sm text-ink-muted">
                          with {b.trainer?.user.name ?? "—"}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <CardDescription>Completed sessions will appear here.</CardDescription>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const ACTION_TONE = {
  accent: "bg-accent text-on-accent",
  brand: "bg-brand text-on-brand",
} as const;

function QuickAction({
  href,
  icon: Icon,
  tone,
  title,
  body,
}: {
  href: string;
  icon: LucideIcon;
  tone: keyof typeof ACTION_TONE;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-1) transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-control/40 hover:shadow-(--shadow-2) sm:p-5"
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-md shadow-(--shadow-1) ${ACTION_TONE[tone]}`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-heading-md font-semibold">{title}</span>
        <span className="mt-0.5 block text-body-sm text-ink-muted">{body}</span>
      </span>
      <ArrowRight
        className="mt-1 size-4 shrink-0 text-ink-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink"
        aria-hidden
      />
    </Link>
  );
}

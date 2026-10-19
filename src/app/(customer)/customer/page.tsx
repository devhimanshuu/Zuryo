import { ArrowRight, Bell, CalendarClock, ClipboardCheck, NotebookPen, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingItem } from "@/features/bookings/booking-item";
import { PackageMeter } from "@/features/customers/package-meter";
import { coverageSummary } from "@/lib/payments/coverage";
import { safely } from "@/lib/utils/errors";
import { formatDay, greeting, titleCase } from "@/lib/utils/format";
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

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body-sm text-ink-muted">{profile.serviceZone.name}</p>
          <h1 className="font-display text-display-md">
            {greeting()}, {firstName}
          </h1>
        </div>
        {unread > 0 ? (
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-body-sm font-semibold text-brand">
            <Bell className="size-4" aria-hidden /> {unread} unread update{unread === 1 ? "" : "s"}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="next-heading" className="grid gap-3">
        <h2 id="next-heading" className="text-heading-md font-semibold">
          Your next session
        </h2>
        {next ? (
          <BookingItem
            b={{
              ...next,
              counterpartLabel: "Trainer",
              counterpartName: next.trainer?.user.name ?? null,
              location: next.serviceZone.name,
              href: `/customer/bookings/${next.id}`,
              coverage: coverageSummary(next),
              session: next.sessionRecord,
            }}
          />
        ) : (
          <EmptyState
            title="No upcoming sessions"
            body="When you book a trainer, your next session shows up here."
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="instant">
            <Link href="/customer/bookings/new?mode=instant">
              <Zap aria-hidden /> Train within the hour
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/customer/bookings/new?mode=scheduled">
              <CalendarClock aria-hidden /> Schedule a session
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Package</CardTitle>
          </CardHeader>
          <CardContent>
            {pkg ? (
              <div className="grid gap-3">
                <PackageMeter name={pkg.name} total={pkg.totalSessions} used={pkg.usedSessions} />
                <Link
                  href="/customer/packages"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
                >
                  Usage history and packages <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            ) : (
              <div className="grid gap-3">
                <p className="text-ink-muted">No active package. You pay per session.</p>
                <Link
                  href="/customer/packages"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
                >
                  See packages <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fitness profile</CardTitle>
            <ClipboardCheck className="size-5 text-ink-subtle" aria-hidden />
          </CardHeader>
          <CardContent className="grid gap-3">
            {profile.assessedAt ? (
              <>
                <p className="text-ink-muted">
                  {profile.fitnessLevel ? titleCase(profile.fitnessLevel) : "Level not set"}
                  {profile.fitnessGoals.length > 0
                    ? ` · ${profile.fitnessGoals.map(titleCase).join(", ")}`
                    : ""}
                </p>
                <Link
                  href="/customer/fitness"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
                >
                  View profile and history <ArrowRight className="size-4" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="text-ink-muted">Assessment not completed yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
            <NotebookPen className="size-5 text-ink-subtle" aria-hidden />
          </CardHeader>
          <CardContent>
            {recent.length > 0 ? (
              <ul className="grid gap-3">
                {recent.map((b) => (
                  <li key={b.id} className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{formatDay(b.startAt)}</span>
                    <span className="truncate text-body-sm text-ink-muted">
                      with {b.trainer?.user.name ?? "—"}
                    </span>
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

import {
  CalendarCheck,
  CalendarClock,
  Dumbbell,
  Flame,
  History,
  LayoutDashboard,
  Settings2,
  Target,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardIcon, CardTitle } from "@/components/ui/card";
import { FitnessProfileForm } from "@/features/fitness/profile-form";
import { WeeklyActivity } from "@/features/fitness/weekly-activity";
import { currentStreak, weeksOfActivity } from "@/lib/activity";
import { categoryLabel } from "@/lib/booking/categories";
import { localDateKey } from "@/lib/booking/time";
import {
  EQUIPMENT_LABELS,
  ENVIRONMENT_LABELS,
  GOAL_LABELS,
  INTENSITY_LABELS,
  PREFERENCE_LABELS,
} from "@/lib/fitness/labels";
import { cn } from "@/lib/utils/cn";
import { safely } from "@/lib/utils/errors";
import { DEFAULT_TZ, formatDay, formatSlot, titleCase } from "@/lib/utils/format";
import { getDb } from "@/lib/db";
import type { FitnessGoal, WorkoutCategory } from "@/lib/validation/enums";
import { actualDurationMinutes, parseActivities, type SessionActivity } from "@/lib/validation/sessions";
import { getActor } from "@/server/auth/actor";
import { getFitnessDashboard } from "@/server/fitness/fitness-service";

export const metadata: Metadata = { title: "Fitness" };

type TabKey = "overview" | "history" | "profile";
const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "history", label: "History", icon: History },
  { key: "profile", label: "Profile", icon: Settings2 },
];

function describe(a: SessionActivity) {
  const parts = [a.sets && a.reps ? `${a.sets} × ${a.reps}` : a.sets ? `${a.sets} sets` : null];
  if (a.durationMin) parts.push(`${a.durationMin} min`);
  if (a.durationSec) parts.push(`${a.durationSec}s`);
  return parts.filter(Boolean).join(" · ");
}

export default async function FitnessPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await getActor("CUSTOMER");
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "overview";
  const result = await safely(() => getFitnessDashboard(getDb(), actor.userId, new Date()));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { profile, goals, stats, sessions, activityDates } = result.data;

  const todayKey = localDateKey(new Date(), DEFAULT_TZ);
  const weeks = weeksOfActivity(activityDates, todayKey, DEFAULT_TZ, 12);
  const streak = currentStreak(activityDates, todayKey, DEFAULT_TZ);

  const activeGoals = (profile?.fitnessGoals ?? []) as FitnessGoal[];
  const goalDetail = new Map(goals.map((g) => [g.goal, g]));
  const maxCategory = Math.max(1, ...stats.categories.map((c) => c.count));
  const chips = [
    profile?.fitnessLevel ? titleCase(profile.fitnessLevel) : null,
    profile?.intensity ? `${INTENSITY_LABELS[profile.intensity]} intensity` : null,
    profile?.environment ? ENVIRONMENT_LABELS[profile.environment] : null,
  ].filter((c): c is string => c !== null);
  const firstName = actor.name.split(" ")[0];

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        editorial
        title="Fitness"
        description="Your progress, goals and session history in one place."
        className="pb-0"
      />

      {/* ── Hero: who you are + the four numbers that matter ─────────── */}
      <section
        aria-label="Summary"
        className="relative overflow-hidden rounded-xl border border-hairline bg-gradient-to-br from-brand-soft via-raised to-raised p-5 shadow-(--shadow-1) sm:p-6"
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-body-sm font-semibold tracking-[0.08em] text-brand uppercase">
              {streak > 0 ? `${streak}-day streak` : "Ready when you are"}
            </p>
            <h2 className="mt-1 font-display text-display-md leading-tight">
              {streak > 0 ? `Keep it going, ${firstName}.` : `Let's get moving, ${firstName}.`}
            </h2>
            {chips.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {chips.map((c) => (
                  <li
                    key={c}
                    className="rounded-full border border-hairline bg-raised/80 px-3 py-1 text-body-sm font-semibold"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-body-sm text-ink-muted">
                Complete your profile so your trainers know where to start.
              </p>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Flame}
              label="Streak"
              value={
                <>
                  <AnimatedNumber value={streak} /> d
                </>
              }
            />
            <Stat icon={CalendarCheck} label="Completed" value={stats.completedCount} />
            <Stat icon={TrendingUp} label="Last 30 days" value={stats.completedLast30Days} />
            <Stat icon={CalendarClock} label="Upcoming" value={stats.upcomingCount} />
          </dl>
        </div>
      </section>

      {/* ── Tabs: one focused view at a time keeps scrolling to a minimum ─ */}
      <nav aria-label="Fitness sections" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex w-max min-w-full gap-1 rounded-lg border border-hairline bg-sunken p-1 sm:w-full">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = key === tab;
            return (
              <li key={key} className="flex-1">
                <Link
                  href={key === "overview" ? "/customer/fitness" : `/customer/fitness?tab=${key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                    active ? "bg-raised text-brand shadow-(--shadow-1)" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <Icon className="size-4" aria-hidden /> {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid content-start gap-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Activity</CardTitle>
                  <p className="text-body-sm text-ink-muted">Sessions per week, last 12 weeks.</p>
                </div>
                <CardIcon icon={TrendingUp} />
              </CardHeader>
              <CardContent className="grid gap-5">
                <WeeklyActivity weeks={weeks} />
                {stats.categories.length > 0 ? (
                  <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                    {stats.categories.map((c) => (
                      <li key={c.category} className="grid gap-1">
                        <p className="flex justify-between text-body-sm">
                          <span className="font-semibold">
                            {categoryLabel(c.category as WorkoutCategory)}
                          </span>
                          <span className="text-ink-muted tabular">{c.count}</span>
                        </p>
                        <span className="h-1.5 overflow-hidden rounded-full bg-sunken">
                          <span
                            className="block h-full rounded-full bg-brand"
                            style={{ width: `${Math.round((c.count / maxCategory) * 100)}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-sm text-ink-muted">
                    No completed sessions yet — your category mix appears here.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid content-start gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Goals</CardTitle>
                <CardIcon icon={Target} />
              </CardHeader>
              <CardContent>
                {activeGoals.length === 0 ? (
                  <p className="text-ink-muted">
                    No goals selected yet.{" "}
                    <Link
                      href="/customer/fitness?tab=profile"
                      className="font-semibold text-brand hover:underline"
                    >
                      Add some
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="grid gap-2.5">
                    {activeGoals.map((g) => {
                      const detail = goalDetail.get(g);
                      const done = detail?.status === "COMPLETED";
                      return (
                        <li key={g} className="rounded-md border border-hairline bg-surface px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold">{GOAL_LABELS[g]}</p>
                            <span
                              className={cn("text-xs font-semibold", done ? "text-success" : "text-brand")}
                            >
                              {done ? "Completed" : "Active"}
                            </span>
                          </div>
                          {detail?.target ? (
                            <p className="text-body-sm text-ink-muted">Target: {detail.target}</p>
                          ) : null}
                          {detail?.targetDate ? (
                            <p className="text-body-sm text-ink-muted">By {formatDay(detail.targetDate)}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profile snapshot</CardTitle>
                <CardIcon icon={UserRound} />
              </CardHeader>
              <CardContent className="grid gap-3">
                {profile ? (
                  <dl className="grid grid-cols-2 gap-2.5 text-body-sm">
                    <Fact label="Age" value={profile.age ? String(profile.age) : "Not set"} />
                    <Fact
                      label="Weight"
                      value={profile.weightKg ? `${profile.weightKg.toString()} kg` : "Not set"}
                    />
                    <Fact
                      label="Equipment"
                      wide
                      value={
                        profile.equipment.length
                          ? profile.equipment.map((e) => EQUIPMENT_LABELS[e]).join(", ")
                          : "None listed"
                      }
                    />
                    <Fact
                      label="Prefers"
                      wide
                      value={
                        profile.workoutPreferences.length
                          ? profile.workoutPreferences.map((p) => PREFERENCE_LABELS[p]).join(", ")
                          : "None listed"
                      }
                    />
                  </dl>
                ) : (
                  <p className="text-ink-muted">No profile yet.</p>
                )}
                {profile?.movementLimitations ? (
                  <p className="rounded-md bg-sunken px-3 py-2 text-body-sm">
                    <span className="font-semibold">Limitations you shared: </span>
                    {profile.movementLimitations}
                  </p>
                ) : null}
                <Link
                  href="/customer/fitness?tab=profile"
                  className="inline-flex min-h-9 items-center text-body-sm font-semibold text-brand hover:underline"
                >
                  Edit profile
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "history" ? (
        <section aria-labelledby="history-h">
          <h2 id="history-h" className="text-heading-md font-semibold">
            Recent sessions
          </h2>
          {sessions.length === 0 ? (
            <EmptyState
              className="mt-3"
              icon={Dumbbell}
              title="No completed sessions yet"
              body="Notes from your trainer appear here after each session."
            />
          ) : (
            <ol className="mt-4 grid gap-0 border-l border-hairline">
              {sessions.map((s) => {
                const activities = parseActivities(s.activities);
                const minutes = actualDurationMinutes(s.startedAt, s.completedAt);
                return (
                  <li key={s.id} className="relative pb-8 pl-6 last:pb-0">
                    <span
                      className="absolute top-1.5 -left-[5px] size-2.5 rounded-full bg-brand ring-4 ring-surface"
                      aria-hidden
                    />
                    <p className="text-body-sm text-ink-muted">
                      {formatSlot(s.startedAt)} · with {s.booking.trainer?.user.name ?? "trainer"}
                      {minutes !== null ? ` · ${minutes} min` : ""}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {activities.map((a, i) => (
                        <li
                          key={i}
                          className="rounded-full border border-hairline bg-raised px-3 py-1 text-body-sm"
                        >
                          <span className="font-semibold">{a.name}</span>
                          {describe(a) ? <span className="text-ink-muted"> · {describe(a)}</span> : null}
                        </li>
                      ))}
                    </ul>
                    {s.trainerNotes ? (
                      <p className="mt-3">
                        <span className="font-semibold">Trainer notes: </span>
                        {s.trainerNotes}
                      </p>
                    ) : null}
                    {s.suggestedNextWorkout ? (
                      <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-body-sm">
                        <span className="font-semibold">Suggested next (from trainer): </span>
                        {s.suggestedNextWorkout}
                      </p>
                    ) : null}
                    <p className="mt-2 text-body-sm">
                      {s.customerFeedback ? (
                        <>
                          <span className="font-semibold">Your feedback: </span>
                          {s.customerFeedback}{" "}
                        </>
                      ) : null}
                      <Link
                        href={`/customer/bookings/${s.bookingId}`}
                        className="font-semibold text-brand hover:underline"
                      >
                        {s.customerFeedback ? "Edit" : "Leave feedback"}
                      </Link>
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : null}

      {tab === "profile" ? (
        <section aria-labelledby="profile-edit-h" className="grid gap-4">
          <h2 id="profile-edit-h" className="sr-only">
            Edit profile
          </h2>
          <FitnessProfileForm
            defaults={{
              age: profile?.age ?? null,
              weightKg: profile?.weightKg ? profile.weightKg.toString() : null,
              workoutPreferences: profile?.workoutPreferences ?? [],
              level: profile?.fitnessLevel ?? null,
              goals: activeGoals,
              goalDetails: Object.fromEntries(
                goals.map((g) => [
                  g.goal,
                  {
                    target: g.target ?? "",
                    targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : "",
                    status: g.status,
                  },
                ]),
              ),
              intensity: profile?.intensity ?? null,
              equipment: profile?.equipment ?? [],
              environment: profile?.environment ?? null,
              avoidExercises: profile?.avoidExercises ?? null,
              accommodations: profile?.accommodations ?? null,
              movementLimitations: profile?.movementLimitations ?? null,
              goalDetailsText: profile?.goalDetails ?? null,
            }}
          />
        </section>
      ) : null}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-hairline bg-raised/90 px-3.5 py-3">
      <dt className="flex items-center gap-1.5 text-body-sm text-ink-muted">
        <Icon className="size-3.5 text-brand" aria-hidden /> {label}
      </dt>
      <dd className="mt-0.5 font-display text-display-md leading-none tabular">{value}</dd>
    </div>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("rounded-md bg-surface px-3 py-2", wide && "col-span-2")}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

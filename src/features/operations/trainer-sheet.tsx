"use client";

import { CalendarClock, ChevronRight, History, Loader2, Mail, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/shared/avatar";
import { Notice } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { describeTravel, estimateTravel, toLatLng } from "@/lib/location/travel";
import { formatDay, formatSlot, formatTime, titleCase } from "@/lib/utils/format";
import { getOperationsTrainerDetailAction } from "@/server/actions/operations";

type Detail = Extract<Awaited<ReturnType<typeof getOperationsTrainerDetailAction>>, { ok: true }>["data"];

/**
 * Operations drill-down for one trainer: the profile the matcher uses, lifetime figures, the next
 * availability windows, upcoming sessions, and the past sessions with the trainer's notes and the
 * customer's feedback.
 */
export function OperationsTrainerSheet({ trainerId, name }: { trainerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await getOperationsTrainerDetailAction(trainerId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setDetail(res.data);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !detail) void load();
    if (!next) {
      setDetail(null);
      setError(null);
    }
  }

  const zone = detail?.profile.zone;
  const travel =
    detail && zone
      ? (() => {
          const base = toLatLng(detail.profile.base.latitude, detail.profile.base.longitude);
          const community = toLatLng(zone.latitude, zone.longitude);
          return base && community ? estimateTravel(base, community) : null;
        })()
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2" aria-label={`View profile for ${name}`}>
          Profile <ChevronRight aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent side="right" className="p-0">
        <div className="sticky top-0 z-10 border-b border-hairline bg-raised/95 px-6 py-4 pr-14 backdrop-blur">
          <DialogTitle className="text-heading-md">{detail?.profile.name ?? name}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.profile.zone.name}, ${detail.profile.zone.city}`
              : "Profile, availability and session history."}
          </DialogDescription>
        </div>

        <div className="grid gap-6 px-6 py-5">
          {loading && !detail ? (
            <p className="inline-flex items-center gap-2 text-body-sm text-ink-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading trainer…
            </p>
          ) : error ? (
            <Notice tone="danger" live>
              {error}{" "}
              <button type="button" onClick={() => void load()} className="font-semibold underline">
                Try again
              </button>
            </Notice>
          ) : detail ? (
            <>
              <div className="flex items-start gap-4">
                <Avatar
                  name={detail.profile.name}
                  size="lg"
                  tone={detail.profile.isActive ? "brand" : "neutral"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{detail.profile.name}</p>
                    <span
                      className={
                        detail.profile.isActive
                          ? "inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success"
                          : "inline-flex items-center gap-1.5 rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-muted"
                      }
                    >
                      <span
                        aria-hidden
                        className={
                          detail.profile.isActive
                            ? "size-1.5 rounded-full bg-success"
                            : "size-1.5 rounded-full bg-ink-subtle"
                        }
                      />
                      {detail.profile.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-body-sm text-ink-muted">
                    <Mail className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                    <a href={`mailto:${detail.profile.email}`} className="truncate hover:underline">
                      {detail.profile.email}
                    </a>
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-body-sm text-ink-muted">
                    <MapPin className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                    Serves {detail.profile.zone.name}, {detail.profile.zone.city}
                  </p>
                  <p className="mt-1 text-body-sm text-ink-subtle">
                    {detail.profile.experienceYears
                      ? `${detail.profile.experienceYears} yrs experience · `
                      : ""}
                    Joined {formatDay(new Date(detail.profile.joinedAt), detail.profile.zone.timezone)}
                  </p>
                </div>
              </div>

              {detail.profile.bio ? (
                <p className="text-body-md text-ink-muted">{detail.profile.bio}</p>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                {detail.profile.specializations.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-xs text-ink-muted"
                  >
                    {s}
                  </span>
                ))}
                {detail.profile.workoutCategories.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand"
                  >
                    {titleCase(c)}
                  </span>
                ))}
              </div>

              <p className="text-body-sm text-ink-muted">
                {travel
                  ? `Base ${describeTravel(travel)} from the community (simulated)`
                  : "No base location: matched by community only"}
              </p>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Completed", value: detail.stats.completed },
                  { label: "Upcoming", value: detail.stats.upcoming },
                  { label: "Assigned total", value: detail.stats.total },
                  { label: "Customers", value: detail.stats.customers },
                  { label: "Cancelled", value: detail.stats.cancelled },
                  { label: "Missed", value: detail.stats.missed },
                  { label: "Notes written", value: detail.stats.notes },
                  { label: "Feedback received", value: detail.stats.feedback },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-md border border-hairline bg-surface p-3">
                    <dt className="text-xs font-semibold tracking-[0.06em] text-ink-subtle uppercase">
                      {stat.label}
                    </dt>
                    <dd className="mt-0.5 text-heading-md font-semibold tabular">{stat.value}</dd>
                  </div>
                ))}
              </dl>

              <section>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <CalendarClock className="size-4 text-ink-subtle" aria-hidden /> Next availability
                </h3>
                {detail.availability.length === 0 ? (
                  <p className="text-body-sm text-ink-muted">No availability published from now on.</p>
                ) : (
                  <ul className="grid gap-1.5 text-body-sm">
                    {detail.availability.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {formatSlot(new Date(a.startAt), detail.profile.zone.timezone)} –{" "}
                          {formatTime(new Date(a.endAt), detail.profile.zone.timezone)}
                        </span>
                        <span
                          className={
                            a.status === "AVAILABLE"
                              ? "rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success"
                              : "rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-muted"
                          }
                        >
                          {a.status === "AVAILABLE" ? "Available" : "Blocked"}
                        </span>
                        {a.note ? <span className="w-full text-ink-subtle">{a.note}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <Users className="size-4 text-ink-subtle" aria-hidden /> Upcoming sessions
                </h3>
                {detail.upcoming.length === 0 ? (
                  <p className="text-body-sm text-ink-muted">Nothing booked with this trainer yet.</p>
                ) : (
                  <ul className="grid gap-2">
                    {detail.upcoming.map((b) => (
                      <li
                        key={b.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline bg-surface px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-body-sm font-semibold">{b.customerName}</p>
                          <p className="text-body-sm text-ink-muted">
                            {formatSlot(new Date(b.startAt), detail.profile.zone.timezone)}
                            {b.category ? ` · ${titleCase(b.category)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-body-sm text-ink-subtle tabular">{b.reference}</span>
                          <StatusBadge status={b.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <History className="size-4 text-ink-subtle" aria-hidden /> Session history
                </h3>
                {detail.history.length === 0 ? (
                  <p className="text-body-sm text-ink-muted">No past sessions recorded.</p>
                ) : (
                  <ol className="grid gap-3 border-l border-hairline pl-4">
                    {detail.history.map((b) => {
                      // A scheduled slot whose end has passed without completion is a missed session.
                      const missed =
                        (b.status === "PENDING" || b.status === "CONFIRMED") &&
                        new Date(b.startAt) < new Date();
                      return (
                        <li key={b.id} className="relative">
                          <span
                            aria-hidden
                            className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-body-sm font-semibold">
                              {b.customerName}
                              <span className="ml-1.5 font-normal text-ink-subtle tabular">
                                {b.reference}
                              </span>
                            </p>
                            {missed ? (
                              <span className="inline-flex h-6 items-center rounded-sm bg-warning-soft px-2 text-xs font-semibold text-warning">
                                Missed
                              </span>
                            ) : (
                              <StatusBadge status={b.status} />
                            )}
                          </div>
                          <p className="text-body-sm text-ink-muted">
                            {formatSlot(new Date(b.startAt), detail.profile.zone.timezone)}
                            {b.category ? ` · ${titleCase(b.category)}` : ""}
                            {b.mode === "INSTANT" ? " · instant" : ""}
                          </p>
                          {b.packageName ? (
                            <p className="text-body-sm text-ink-subtle">Paid with {b.packageName}</p>
                          ) : null}
                          {b.cancellationReason ? (
                            <p className="mt-0.5 text-body-sm text-ink-subtle">
                              Cancelled: {b.cancellationReason}
                            </p>
                          ) : null}
                          {b.session?.trainerNotes ? (
                            <p className="mt-1 text-body-sm text-ink-subtle">
                              <span className="font-semibold text-ink-muted">Notes:</span>{" "}
                              {b.session.trainerNotes}
                            </p>
                          ) : null}
                          {b.session?.suggestedNextWorkout ? (
                            <p className="text-body-sm text-ink-subtle">
                              <span className="font-semibold text-ink-muted">Next workout:</span>{" "}
                              {b.session.suggestedNextWorkout}
                            </p>
                          ) : null}
                          {b.session?.customerFeedback ? (
                            <p className="text-body-sm text-ink-subtle">
                              <span className="font-semibold text-ink-muted">Customer feedback:</span>{" "}
                              {b.session.customerFeedback}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <div className="border-t border-hairline pt-3">
                <Link
                  href={`/operations/bookings?q=${encodeURIComponent(detail.profile.name)}`}
                  className="inline-flex items-center gap-1 text-body-sm font-semibold text-brand hover:underline"
                >
                  All bookings with this trainer <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

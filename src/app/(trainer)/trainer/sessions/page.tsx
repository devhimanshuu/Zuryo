import { Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { BookingItem } from "@/features/bookings/booking-item";
import { CancelBookingButton } from "@/features/bookings/cancel-booking-button";
import { cancellationBlocker } from "@/lib/booking/cancellation";
import { startBlocker } from "@/lib/sessions/lifecycle";
import { safely } from "@/lib/utils/errors";
import { formatSlot } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import { getTrainerSessions } from "@/server/queries/trainer";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "My sessions" };

export default async function TrainerSessionsPage() {
  const actor = await getActor("TRAINER");
  // Only bookings assigned to the acting trainer are ever loaded (reconciled against the clock first).
  const result = await safely(async () => {
    await reconcileDueSessions(defaultDeps(), { trainerId: actor.userId });
    return getTrainerSessions(actor.userId);
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;

  const now = new Date();
  const rows = result.data;
  const active = rows.filter((b) => b.status === "IN_PROGRESS");
  const upcoming = rows
    .filter((b) => (b.status === "CONFIRMED" || b.status === "PENDING") && b.endAt >= now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const completed = rows.filter((b) => b.status === "COMPLETED");
  const cancelled = rows.filter((b) => b.status === "CANCELLED");
  const missed = rows.filter((b) => (b.status === "CONFIRMED" || b.status === "PENDING") && b.endAt < now);

  const toItem = (b: (typeof rows)[number]) => ({
    ...b,
    counterpartLabel: "Customer",
    counterpartName: b.customer.user.name,
    location: `${b.serviceZone.name}${b.customer.addressLine ? `, ${b.customer.addressLine}` : ""}`,
    notes: b.customerNotes,
    href: `/trainer/sessions/${b.id}`,
    session: b.sessionRecord,
  });

  const groups = [
    {
      id: "active",
      title: "Active now",
      items: active,
      empty: "No session in progress",
      body: "Start a session from its page when the customer is ready.",
    },
    {
      id: "up",
      title: "Upcoming",
      items: upcoming,
      empty: "No upcoming sessions",
      body: "New bookings assigned to you appear here, and you'll get a notification.",
    },
    { id: "done", title: "Completed", items: completed, empty: "No completed sessions yet", body: undefined },
    { id: "cancelled", title: "Cancelled", items: cancelled, empty: "Nothing cancelled", body: undefined },
    ...(missed.length
      ? [
          {
            id: "missed",
            title: "Not started",
            items: missed,
            empty: "",
            body: undefined,
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader title="My sessions" description={`Sessions assigned to ${actor.name}. Times in IST.`} />
      <nav aria-label="Session groups" className="-mx-1 mb-8 flex gap-2 overflow-x-auto px-1 pb-1">
        {groups.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-hairline bg-raised py-1.5 pr-1.5 pl-3.5 text-sm font-semibold whitespace-nowrap shadow-(--shadow-1) transition-colors hover:border-control/40 hover:bg-surface"
          >
            {g.title}
            <span
              className={
                g.id === "active" && g.items.length > 0
                  ? "grid h-6 min-w-6 place-items-center rounded-full bg-accent-soft px-1.5 text-xs text-accent-text tabular"
                  : "grid h-6 min-w-6 place-items-center rounded-full bg-sunken px-1.5 text-xs text-ink-muted tabular"
              }
            >
              {g.items.length}
            </span>
          </a>
        ))}
      </nav>
      <div className="grid gap-10">
        {groups.map((g) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="grid scroll-mt-20 gap-3">
            <h2 id={`${g.id}-h`} className="flex items-center gap-2 text-heading-md font-semibold">
              {g.title} <span className="text-body-md font-normal text-ink-subtle tabular">{g.items.length}</span>
            </h2>
            {g.id === "missed" ? (
              <p className="text-body-sm text-ink-muted">
                These sessions passed their start window without being started. Operations can see them on the
                dashboard.
              </p>
            ) : null}
            {g.items.length ? (
              g.items.map((b) => (
                <BookingItem
                  key={b.id}
                  b={toItem(b)}
                  actions={
                    <>
                      {b.status === "IN_PROGRESS" || (b.status === "CONFIRMED" && !startBlocker(b, now)) ? (
                        <Button asChild size="sm" variant={b.status === "IN_PROGRESS" ? "primary" : "instant"}>
                          <Link href={`/trainer/sessions/${b.id}`}>
                            <Play aria-hidden /> {b.status === "IN_PROGRESS" ? "Open live session" : "Start session"}
                          </Link>
                        </Button>
                      ) : null}
                      {cancellationBlocker(b, now) ? null : (
                        <CancelBookingButton
                          as="TRAINER"
                          bookingId={b.id}
                          reference={b.reference}
                          whenLabel={`${formatSlot(b.startAt)} with ${b.customer.user.name}`}
                        />
                      )}
                    </>
                  }
                />
              ))
            ) : (
              <EmptyState title={g.empty} body={g.body} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

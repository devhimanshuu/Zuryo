import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { BookingItem } from "@/features/bookings/booking-item";
import { CancelBookingButton } from "@/features/bookings/cancel-booking-button";
import { cancellationBlocker } from "@/lib/booking/cancellation";
import { coverageSummary } from "@/lib/payments/coverage";
import { safely } from "@/lib/utils/errors";
import { formatSlot } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import { getCustomerBookings } from "@/server/queries/customer";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "My bookings" };

export default async function CustomerBookingsPage() {
  const actor = await getActor("CUSTOMER");
  const result = await safely(async () => {
    // Bring any of this customer's sessions that hit their warning or deadline up to date first.
    await reconcileDueSessions(defaultDeps(), { customerId: actor.userId });
    return getCustomerBookings(actor.userId);
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;

  const now = new Date();
  const rows = result.data;
  const inProgress = rows.filter((b) => b.status === "IN_PROGRESS");
  const upcoming = rows
    .filter((b) => (b.status === "CONFIRMED" || b.status === "PENDING") && b.endAt >= now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const completed = rows.filter((b) => b.status === "COMPLETED");
  const cancelled = rows.filter((b) => b.status === "CANCELLED");
  // Didn't go ahead: declined payments, and confirmed sessions whose time passed without a start.
  const other = rows.filter(
    (b) => b.status === "FAILED" || ((b.status === "CONFIRMED" || b.status === "PENDING") && b.endAt < now),
  );

  const groups = [
    ...(inProgress.length
      ? [{ id: "live", title: "In progress", items: inProgress, empty: "", hint: undefined }]
      : []),
    {
      id: "upcoming",
      title: "Upcoming",
      items: upcoming,
      empty: "No upcoming sessions",
      hint: "Book a trainer and your next session shows up here.",
    },
    { id: "completed", title: "Completed", items: completed, empty: "No completed sessions yet", hint: undefined },
    { id: "cancelled", title: "Cancelled", items: cancelled, empty: "Nothing cancelled", hint: undefined },
    ...(other.length
      ? [
          {
            id: "other",
            title: "Didn't go ahead",
            items: other,
            empty: "",
            hint: undefined,
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        editorial
        title="My bookings"
        description={`Sessions for ${actor.name}: what's coming up, what's done, and how each was paid for.`}
        actions={
          <Button asChild variant="primary">
            <Link href="/customer/bookings/new">
              <CalendarPlus aria-hidden /> Book a session
            </Link>
          </Button>
        }
      />
      <nav aria-label="Booking groups" className="mb-6 flex gap-2 overflow-x-auto">
        {groups.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className="rounded-full border border-hairline bg-raised px-3 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-sunken"
          >
            {g.title} <span className="text-ink-subtle tabular">{g.items.length}</span>
          </a>
        ))}
      </nav>
      <div className="grid gap-10">
        {groups.map((g) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="grid scroll-mt-20 gap-3">
            <h2 id={`${g.id}-h`} className="text-heading-md font-semibold">
              {g.title}
            </h2>
            {g.items.length > 0 ? (
              g.items.map((b) => (
                <BookingItem
                  key={b.id}
                  b={{
                    ...b,
                    counterpartLabel: "Trainer",
                    counterpartName: b.trainer?.user.name ?? null,
                    location: b.serviceZone.name,
                    href: `/customer/bookings/${b.id}`,
                    coverage: coverageSummary(b),
                    session: b.sessionRecord,
                  }}
                  actions={
                    cancellationBlocker(b, now) ? null : (
                      <CancelBookingButton
                        as="CUSTOMER"
                        bookingId={b.id}
                        reference={b.reference}
                        whenLabel={`${formatSlot(b.startAt)}${b.trainer ? ` with ${b.trainer.user.name}` : ""}`}
                      />
                    )
                  }
                />
              ))
            ) : (
              <EmptyState
                title={g.empty}
                body={g.hint}
                action={
                  g.id === "upcoming" ? (
                    <Button asChild variant="primary" size="sm">
                      <Link href="/customer/bookings/new">Book a session</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

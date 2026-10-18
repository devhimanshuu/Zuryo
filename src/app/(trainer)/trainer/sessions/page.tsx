import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { BookingItem } from "@/features/bookings/booking-item";
import { CancelBookingButton } from "@/features/bookings/cancel-booking-button";
import { cancellationBlocker } from "@/lib/booking/cancellation";
import { isActiveStatus } from "@/lib/booking/rules";
import { safely } from "@/lib/utils/errors";
import { formatSlot } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { getTrainerSessions } from "@/server/queries/trainer";

export const metadata: Metadata = { title: "My sessions" };

export default async function TrainerSessionsPage() {
  const actor = await getActor("TRAINER");
  // Only bookings assigned to the acting trainer are ever loaded.
  const result = await safely(() => getTrainerSessions(actor.userId));
  if (!result.ok) return <ErrorState message={result.error.message} />;

  const now = new Date();
  const upcoming = result.data
    .filter((b) => isActiveStatus(b.status) && b.endAt >= now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const cancelled = result.data.filter((b) => b.status === "CANCELLED");
  const past = result.data.filter((b) => b.status !== "CANCELLED" && !upcoming.includes(b));

  const toItem = (b: (typeof result.data)[number]) => ({
    ...b,
    counterpartLabel: "Customer",
    counterpartName: b.customer.user.name,
    location: `${b.serviceZone.name}${b.customer.addressLine ? `, ${b.customer.addressLine}` : ""}`,
    notes: b.customerNotes,
  });

  const groups = [
    {
      id: "up",
      title: "Upcoming",
      items: upcoming,
      empty: "No upcoming sessions",
      body: "New bookings assigned to you appear here, and you'll get a notification.",
    },
    { id: "past", title: "Past", items: past, empty: "No past sessions", body: undefined },
    { id: "cancelled", title: "Cancelled", items: cancelled, empty: "Nothing cancelled", body: undefined },
  ];

  return (
    <div>
      <PageHeader title="My sessions" description={`Sessions assigned to ${actor.name}. Times in IST.`} />
      <div className="grid gap-10">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`${g.id}-h`} className="grid gap-3">
            <h2 id={`${g.id}-h`} className="text-heading-md font-semibold">
              {g.title} <span className="text-ink-subtle tabular">{g.items.length}</span>
            </h2>
            {g.items.length ? (
              g.items.map((b) => (
                <BookingItem
                  key={b.id}
                  b={toItem(b)}
                  actions={
                    cancellationBlocker(b, now) ? null : (
                      <CancelBookingButton
                        as="TRAINER"
                        bookingId={b.id}
                        reference={b.reference}
                        whenLabel={`${formatSlot(b.startAt)} with ${b.customer.user.name}`}
                      />
                    )
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

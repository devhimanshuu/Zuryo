import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState, PhaseNote } from "@/components/shared/states";
import { BookingItem } from "@/features/bookings/booking-item";
import { safely } from "@/lib/utils/errors";
import { DEMO_PERSONAS } from "@/server/demo";
import { getCustomerBookings } from "@/server/queries/customer";

export const metadata: Metadata = { title: "My bookings" };

export default async function CustomerBookingsPage() {
  const result = await safely(() => getCustomerBookings(DEMO_PERSONAS.CUSTOMER.userId));
  if (!result.ok) return <ErrorState message={result.error.message} />;

  const now = Date.now();
  const toItem = (b: (typeof result.data)[number]) => ({
    ...b,
    counterpartLabel: "Trainer",
    counterpartName: b.trainer?.user.name ?? null,
    location: b.serviceZone.name,
  });
  const upcoming = result.data
    .filter((b) => ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.endAt.getTime() >= now)
    .reverse();
  const past = result.data.filter((b) => b.status === "COMPLETED" || b.status === "FAILED");
  const cancelled = result.data.filter((b) => b.status === "CANCELLED");

  const groups = [
    { id: "upcoming", title: "Upcoming", items: upcoming, empty: "No upcoming sessions." },
    { id: "past", title: "Past", items: past, empty: "No past sessions yet." },
    { id: "cancelled", title: "Cancelled", items: cancelled, empty: "Nothing cancelled." },
  ];

  return (
    <div>
      <PageHeader editorial title="My bookings" description="Upcoming, past and cancelled sessions." />
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
              g.items.map((b) => <BookingItem key={b.id} b={toItem(b)} />)
            ) : (
              <EmptyState title={g.empty} />
            )}
          </section>
        ))}
        <PhaseNote phase={2}>
          Cancelling and rescheduling, with the package balance effect, are built with the booking engine.
        </PhaseNote>
      </div>
    </div>
  );
}

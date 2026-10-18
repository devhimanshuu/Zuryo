import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { BookingItem } from "@/features/bookings/booking-item";
import { safely } from "@/lib/utils/errors";
import { DEMO_PERSONAS } from "@/server/demo";
import { getTrainerSessions } from "@/server/queries/trainer";

export const metadata: Metadata = { title: "My sessions" };

export default async function TrainerSessionsPage() {
  const result = await safely(() => getTrainerSessions(DEMO_PERSONAS.TRAINER.userId));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const now = Date.now();
  const upcoming = result.data.filter((b) => b.endAt.getTime() >= now && b.status !== "CANCELLED").reverse();
  const past = result.data.filter((b) => b.endAt.getTime() < now || b.status === "CANCELLED");
  const toItem = (b: (typeof result.data)[number]) => ({
    ...b,
    counterpartLabel: "Customer",
    counterpartName: b.customer.user.name,
    location: `${b.serviceZone.name}${b.customer.addressLine ? `, ${b.customer.addressLine}` : ""}`,
  });

  return (
    <div>
      <PageHeader title="My sessions" description="Sessions assigned to you, newest first." />
      <div className="grid gap-10">
        <section aria-labelledby="up-h" className="grid gap-3">
          <h2 id="up-h" className="text-heading-md font-semibold">
            Upcoming
          </h2>
          {upcoming.length ? (
            upcoming.map((b) => <BookingItem key={b.id} b={toItem(b)} />)
          ) : (
            <EmptyState title="No upcoming sessions" />
          )}
        </section>
        <section aria-labelledby="past-h" className="grid gap-3">
          <h2 id="past-h" className="text-heading-md font-semibold">
            Past and cancelled
          </h2>
          {past.length ? (
            past.map((b) => <BookingItem key={b.id} b={toItem(b)} />)
          ) : (
            <EmptyState title="No past sessions" />
          )}
        </section>
      </div>
    </div>
  );
}

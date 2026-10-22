import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { BookingItem } from "@/features/bookings/booking-item";
import { CancelBookingButton } from "@/features/bookings/cancel-booking-button";
import { cancellationBlocker } from "@/lib/booking/cancellation";
import { parseChoice, parsePage } from "@/lib/pagination";
import { coverageSummary } from "@/lib/payments/coverage";
import { cn } from "@/lib/utils/cn";
import { safely } from "@/lib/utils/errors";
import { formatSlot } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import {
  CUSTOMER_BOOKING_TABS,
  getCustomerBookings,
  type CustomerBookingTab,
} from "@/server/queries/customer";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "My bookings" };

const TAB_INFO: Record<CustomerBookingTab, { label: string; empty: string; hint?: string }> = {
  upcoming: {
    label: "Upcoming",
    empty: "No upcoming sessions",
    hint: "Book a trainer and your next session shows up here.",
  },
  completed: { label: "Completed", empty: "No completed sessions yet" },
  cancelled: { label: "Cancelled", empty: "Nothing cancelled" },
  other: {
    label: "Didn't go ahead",
    empty: "Nothing here",
    hint: "Declined payments and scheduled sessions that passed without starting appear here.",
  },
};

export default async function CustomerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const actor = await getActor("CUSTOMER");
  const { status, page: rawPage } = await searchParams;
  const tab = parseChoice(status, CUSTOMER_BOOKING_TABS, "upcoming");
  const page = parsePage(rawPage);
  const result = await safely(async () => {
    // Bring any of this customer's sessions that hit their warning or deadline up to date first.
    await reconcileDueSessions(defaultDeps(), { customerId: actor.userId });
    return getCustomerBookings(actor.userId, tab, page);
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;

  const now = new Date();
  const data = result.data;
  const info = TAB_INFO[tab];
  const search = tab === "upcoming" ? {} : { status: tab };

  const renderBooking = (b: (typeof data.rows)[number]) => (
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
  );

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
      <nav aria-label="Booking groups" className="-mx-1 mb-8 flex gap-2 overflow-x-auto px-1 pb-1">
        {CUSTOMER_BOOKING_TABS.map((id) => {
          const active = id === tab;
          return (
            <Link
              key={id}
              href={id === "upcoming" ? "/customer/bookings" : `/customer/bookings?status=${id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-3.5 text-sm font-semibold whitespace-nowrap shadow-(--shadow-1) transition-colors",
                active
                  ? "border-brand/50 bg-brand-soft text-brand-strong"
                  : "border-hairline bg-raised hover:border-control/40 hover:bg-surface",
              )}
            >
              {TAB_INFO[id].label}
              <span
                className={cn(
                  "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs tabular",
                  active ? "bg-canvas text-brand-strong" : "bg-sunken text-ink-muted",
                )}
              >
                {data.counts[id]}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-10">
        {data.live.length > 0 ? (
          <section aria-labelledby="live-h" className="grid gap-3">
            <h2 id="live-h" className="flex items-center gap-2 text-heading-md font-semibold">
              In progress{" "}
              <span className="text-body-md font-normal text-ink-subtle tabular">{data.live.length}</span>
            </h2>
            {data.live.map(renderBooking)}
          </section>
        ) : null}

        <section aria-labelledby="list-h" className="grid gap-3">
          <h2 id="list-h" className="flex items-center gap-2 text-heading-md font-semibold">
            {info.label}{" "}
            <span className="text-body-md font-normal text-ink-subtle tabular">{data.total}</span>
          </h2>
          {data.rows.length > 0 ? (
            data.rows.map(renderBooking)
          ) : (
            <EmptyState
              title={info.empty}
              body={info.hint}
              action={
                tab === "upcoming" ? (
                  <Button asChild variant="primary" size="sm">
                    <Link href="/customer/bookings/new">Book a session</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
          <Pagination
            pathname="/customer/bookings"
            searchParams={search}
            result={data}
            itemLabel="bookings"
          />
        </section>
      </div>
    </div>
  );
}

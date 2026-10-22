import { Play } from "lucide-react";
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
import { startBlocker } from "@/lib/sessions/lifecycle";
import { cn } from "@/lib/utils/cn";
import { safely } from "@/lib/utils/errors";
import { formatSlot } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import { TRAINER_SESSION_TABS, getTrainerSessions, type TrainerSessionTab } from "@/server/queries/trainer";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "My sessions" };

const TAB_INFO: Record<TrainerSessionTab, { label: string; empty: string; hint?: string }> = {
  upcoming: {
    label: "Upcoming",
    empty: "No upcoming sessions",
    hint: "New bookings assigned to you appear here, and you'll get a notification.",
  },
  completed: { label: "Completed", empty: "No completed sessions yet" },
  cancelled: { label: "Cancelled", empty: "Nothing cancelled" },
  missed: {
    label: "Not started",
    empty: "Nothing missed",
    hint: "These sessions passed their start window without being started. Operations can see them on the dashboard.",
  },
};

export default async function TrainerSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const actor = await getActor("TRAINER");
  const { status, page: rawPage } = await searchParams;
  const tab = parseChoice(status, TRAINER_SESSION_TABS, "upcoming");
  const page = parsePage(rawPage);
  // Only bookings assigned to the acting trainer are ever loaded (reconciled against the clock first).
  const result = await safely(async () => {
    await reconcileDueSessions(defaultDeps(), { trainerId: actor.userId });
    return getTrainerSessions(actor.userId, tab, page);
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;

  const now = new Date();
  const data = result.data;
  const info = TAB_INFO[tab];
  const search = tab === "upcoming" ? {} : { status: tab };

  const renderSession = (b: (typeof data.rows)[number]) => (
    <BookingItem
      key={b.id}
      b={{
        ...b,
        counterpartLabel: "Customer",
        counterpartName: b.customer.user.name,
        location: `${b.serviceZone.name}${b.customer.addressLine ? `, ${b.customer.addressLine}` : ""}`,
        notes: b.customerNotes,
        href: `/trainer/sessions/${b.id}`,
        session: b.sessionRecord,
      }}
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
  );

  return (
    <div>
      <PageHeader title="My sessions" description={`Sessions assigned to ${actor.name}. Times in IST.`} />
      <nav aria-label="Session groups" className="-mx-1 mb-8 flex gap-2 overflow-x-auto px-1 pb-1">
        {TRAINER_SESSION_TABS.map((id) => {
          const active = id === tab;
          return (
            <Link
              key={id}
              href={id === "upcoming" ? "/trainer/sessions" : `/trainer/sessions?status=${id}`}
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
              Active now{" "}
              <span className="text-body-md font-normal text-ink-subtle tabular">{data.live.length}</span>
            </h2>
            {data.live.map(renderSession)}
          </section>
        ) : null}

        <section aria-labelledby="list-h" className="grid gap-3">
          <h2 id="list-h" className="flex items-center gap-2 text-heading-md font-semibold">
            {info.label}{" "}
            <span className="text-body-md font-normal text-ink-subtle tabular">{data.total}</span>
          </h2>
          {tab === "missed" && data.rows.length > 0 ? (
            <p className="text-body-sm text-ink-muted">{info.hint}</p>
          ) : null}
          {data.rows.length > 0 ? (
            data.rows.map(renderSession)
          ) : (
            <EmptyState title={info.empty} body={info.hint} />
          )}
          <Pagination pathname="/trainer/sessions" searchParams={search} result={data} itemLabel="sessions" />
        </section>
      </div>
    </div>
  );
}

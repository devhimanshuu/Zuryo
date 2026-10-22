import type { Metadata } from "next";
import { Download } from "lucide-react";
import { CopyButton } from "@/components/shared/copy-button";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { OperationsBookingSheet } from "@/features/operations/booking-sheet";
import { OperationsFilterShell } from "@/features/operations/filter-shell";
import {
  BOOKING_STATUS_FILTERS,
  normalizeQuery,
  parseBookingSort,
  parseBookingStatus,
} from "@/lib/operations-filters";
import { parsePage } from "@/lib/pagination";
import { coverageSummary } from "@/lib/payments/coverage";
import { formatINR } from "@/lib/pricing";
import { safely } from "@/lib/utils/errors";
import { formatSlot, titleCase } from "@/lib/utils/format";
import { getOperationsBookings } from "@/server/queries/operations";

export const metadata: Metadata = { title: "Bookings" };

export default async function OperationsBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; sort?: string }>;
}) {
  const { page: rawPage, q, status, sort } = await searchParams;
  const page = parsePage(rawPage);
  const filters = { q: normalizeQuery(q), status: parseBookingStatus(status), sort: parseBookingSort(sort) };
  const result = await safely(() => getOperationsBookings(page, undefined, filters));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const bookings = result.data;
  const rows = bookings.rows;
  const filtered = Boolean(filters.q || filters.status);
  const exportParams = new URLSearchParams();
  if (filters.q) exportParams.set("q", filters.q);
  if (filters.status) exportParams.set("status", filters.status);
  if (filters.sort && filters.sort !== "newest") exportParams.set("sort", filters.sort);
  const exportHref = `/operations/bookings/export${exportParams.size ? `?${exportParams}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Bookings"
        description={
          filtered
            ? `${bookings.total} matching booking${bookings.total === 1 ? "" : "s"}.`
            : `${bookings.total} bookings, newest start time first.`
        }
        actions={
          <Button asChild variant="secondary" size="sm">
            <a href={exportHref}>
              <Download aria-hidden /> Export CSV
            </a>
          </Button>
        }
      />

      <OperationsFilterShell
        resultSummary={`${bookings.total} booking${bookings.total === 1 ? "" : "s"}`}
        searchPlaceholder="Search reference, customer, trainer or community"
          defaultQuery={filters.q}
          selects={[
            {
              name: "status",
              label: "Filter by status",
              defaultValue: "all",
              options: [
                { value: "all", label: "All statuses" },
                ...BOOKING_STATUS_FILTERS.map((s) => ({ value: s, label: titleCase(s) })),
              ],
            },
            {
              name: "sort",
              label: "Sort bookings",
              defaultValue: "newest",
              options: [
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
                { value: "updated", label: "Recently updated" },
              ],
            },
          ]}
      >

      {rows.length === 0 ? (
        <EmptyState
          title="No bookings match these filters"
          body="Try another search term or status, or clear the filters to see everything."
        />
      ) : (
        <>
          {/* Desktop: table. Under 768px the same data renders as stacked cards. */}
          <div className="hidden max-h-[70vh] overflow-auto rounded-lg border border-hairline bg-raised shadow-(--shadow-1) md:block">
            <table className="w-full text-left text-body-md">
              <caption className="sr-only">All bookings</caption>
              <thead className="sticky top-0 z-10 border-b border-hairline bg-raised/95 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase backdrop-blur">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Reference
                  </th>
                  <th scope="col" className="px-4 py-3">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Customer
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Trainer
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Community
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Paid with
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-sunken/40">
                    <td className="px-4 py-3 font-semibold whitespace-nowrap tabular">
                      <span className="inline-flex items-center gap-1">
                        {b.reference}
                        <CopyButton
                          value={b.reference}
                          label={`Copy reference ${b.reference}`}
                          iconOnly
                          variant="ghost"
                          className="px-1.5"
                        />
                      </span>
                      <div className="font-normal">
                        <OperationsBookingSheet bookingId={b.id} reference={b.reference} />
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatSlot(b.startAt)}
                      <span className="block text-body-sm text-ink-subtle">
                        {b.mode === "INSTANT" ? "Instant" : "Scheduled"}
                        {b.isPeak ? " · Peak" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">{b.customer.user.name}</td>
                    <td className="px-4 py-3">
                      {b.trainer?.user.name ?? <span className="font-semibold text-warning">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{b.serviceZone.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-body-sm">{coverageSummary(b).label}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular">{formatINR(b.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {rows.map((b) => (
              <li key={b.id} className="rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-1)">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1 font-semibold tabular">
                      {b.reference}
                      <CopyButton
                        value={b.reference}
                        label={`Copy reference ${b.reference}`}
                        iconOnly
                        variant="ghost"
                        className="px-1.5"
                      />
                    </p>
                    <p className="text-body-sm text-ink-muted">{formatSlot(b.startAt)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
                  <dt className="text-ink-muted">Customer</dt>
                  <dd>{b.customer.user.name}</dd>
                  <dt className="text-ink-muted">Trainer</dt>
                  <dd>
                    {b.trainer?.user.name ?? <span className="font-semibold text-warning">Unassigned</span>}
                  </dd>
                  <dt className="text-ink-muted">Paid with</dt>
                  <dd>{coverageSummary(b).label}</dd>
                  <dt className="text-ink-muted">Total</dt>
                  <dd className="font-semibold tabular">{formatINR(b.totalAmount)}</dd>
                </dl>
                <div className="mt-3 flex justify-end border-t border-hairline pt-2">
                  <OperationsBookingSheet bookingId={b.id} reference={b.reference} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Pagination pathname="/operations/bookings" result={bookings} itemLabel="bookings" />
      </OperationsFilterShell>
    </div>
  );
}

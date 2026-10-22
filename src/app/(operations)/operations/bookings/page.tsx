import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ErrorState, PhaseNote } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/pagination";
import { coverageSummary } from "@/lib/payments/coverage";
import { formatINR } from "@/lib/pricing";
import { safely } from "@/lib/utils/errors";
import { formatSlot } from "@/lib/utils/format";
import { getOperationsBookings } from "@/server/queries/operations";

export const metadata: Metadata = { title: "Bookings" };

export default async function OperationsBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const result = await safely(() => getOperationsBookings(page));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const bookings = result.data;
  const rows = bookings.rows;

  return (
    <div>
      <PageHeader title="Bookings" description={`${bookings.total} bookings, newest start time first.`} />

      {/* Desktop: table. Under 768px the same data renders as stacked cards. */}
      <div className="hidden overflow-hidden rounded-lg border border-hairline bg-raised shadow-(--shadow-1) md:block">
        <table className="w-full text-left text-body-md">
          <caption className="sr-only">All bookings</caption>
          <thead className="border-b border-hairline bg-sunken/60 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
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
                <td className="px-4 py-3 font-semibold whitespace-nowrap tabular">{b.reference}</td>
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
                <p className="font-semibold tabular">{b.reference}</p>
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
          </li>
        ))}
      </ul>

      <Pagination pathname="/operations/bookings" result={bookings} itemLabel="bookings" />

      <div className="mt-6">
        <PhaseNote>Filters, a booking detail drawer and manual reassignment.</PhaseNote>
      </div>
    </div>
  );
}

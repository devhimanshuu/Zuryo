import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Metric } from "@/components/shared/metric";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleRow } from "@/features/bookings/schedule-row";
import { safely } from "@/lib/utils/errors";
import { formatSlot } from "@/lib/utils/format";
import { getOperationsOverview } from "@/server/queries/operations";

export const metadata: Metadata = { title: "Operations overview" };

export default async function OperationsOverviewPage() {
  const result = await safely(getOperationsOverview);
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { counts, unassigned, recent, activeTrainers } = result.data;
  const total = Object.values(counts).reduce<number>((s, n) => s + (n ?? 0), 0);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Overview"
        description="Counts are read live from the database (currently holding seeded demo data)."
        className="pb-0"
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Total bookings" value={total} />
        <Metric label="Confirmed" value={counts.CONFIRMED ?? 0} />
        <Metric label="In progress" value={counts.IN_PROGRESS ?? 0} />
        <Metric label="Completed" value={counts.COMPLETED ?? 0} />
        <Metric label="Cancelled / failed" value={(counts.CANCELLED ?? 0) + (counts.FAILED ?? 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Needs a trainer</CardTitle>
              <p className="text-body-sm text-ink-muted">
                {activeTrainers} active trainers across all communities
              </p>
            </div>
            {unassigned.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">
                <TriangleAlert className="size-3.5" aria-hidden /> {unassigned.length} unassigned
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {unassigned.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {unassigned.map((b) => (
                  <ScheduleRow
                    key={b.id}
                    showDay
                    startAt={b.startAt}
                    status={b.status}
                    title={`${b.reference} · ${b.customer.user.name}`}
                    subtitle={b.serviceZone.name}
                  />
                ))}
              </ul>
            ) : (
              <div className="px-5 pb-3">
                <EmptyState title="Every booking has a trainer" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <ul className="divide-y divide-hairline">
              {recent.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      <span className="tabular">{b.reference}</span> · {b.customer.user.name}
                    </p>
                    <p className="text-body-sm text-ink-muted">{formatSlot(b.startAt)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

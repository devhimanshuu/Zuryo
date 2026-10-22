import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { OperationsFilterShell } from "@/features/operations/filter-shell";
import { describeTravel, estimateTravel, toLatLng } from "@/lib/location/travel";
import { normalizeQuery, parseTrainerActive, parseTrainerSort } from "@/lib/operations-filters";
import { parsePage } from "@/lib/pagination";
import { safely } from "@/lib/utils/errors";
import { getOperationsTrainers } from "@/server/queries/operations";

export const metadata: Metadata = { title: "Trainers" };

export default async function OperationsTrainersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; sort?: string }>;
}) {
  const { page: rawPage, q, status, sort } = await searchParams;
  const page = parsePage(rawPage);
  const filters = { q: normalizeQuery(q), active: parseTrainerActive(status), sort: parseTrainerSort(sort) };
  const result = await safely(() => getOperationsTrainers(page, undefined, undefined, filters));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const trainers = result.data;
  const filtered = Boolean(filters.q || filters.active !== null);

  return (
    <div>
      <PageHeader
        title="Trainers"
        description={
          filtered
            ? `${trainers.total} matching trainer${trainers.total === 1 ? "" : "s"}.`
            : `${trainers.total} trainers who can be assigned to sessions.`
        }
      />

      <OperationsFilterShell
        resultSummary={`${trainers.total} trainer${trainers.total === 1 ? "" : "s"}`}
        searchPlaceholder="Search name, email or community"
          defaultQuery={filters.q}
          selects={[
            {
              name: "status",
              label: "Filter by availability",
              defaultValue: "all",
              options: [
                { value: "all", label: "All trainers" },
                { value: "active", label: "Active only" },
                { value: "inactive", label: "Inactive only" },
              ],
            },
            {
              name: "sort",
              label: "Sort trainers",
              defaultValue: "name",
              options: [
                { value: "name", label: "Name" },
                { value: "experience", label: "Most experienced" },
              ],
            },
          ]}
      >

      {trainers.rows.length === 0 ? (
        <EmptyState
          title="No trainers match these filters"
          body="Try another search term or availability, or clear the filters to see everyone."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {trainers.rows.map((t) => {
            const base = toLatLng(t.baseLatitude, t.baseLongitude);
            const zone = toLatLng(t.serviceZone.latitude, t.serviceZone.longitude);
            const travel = base && zone ? estimateTravel(base, zone) : null;
            return (
              <li
                key={t.userId}
                className="flex gap-4 rounded-lg border border-hairline bg-raised p-5 shadow-(--shadow-1) transition-shadow duration-200 hover:shadow-(--shadow-2)"
              >
                <Avatar name={t.user.name} size="lg" tone={t.isActive ? "brand" : "neutral"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{t.user.name}</p>
                    <span
                      className={
                        t.isActive
                          ? "inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success"
                          : "inline-flex items-center gap-1.5 rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-muted"
                      }
                    >
                      <span
                        className={
                          t.isActive
                            ? "size-1.5 rounded-full bg-success"
                            : "size-1.5 rounded-full bg-ink-subtle"
                        }
                        aria-hidden
                      />
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-body-sm text-ink-muted">
                    {t.serviceZone.name}
                    {t.experienceYears ? ` · ${t.experienceYears} yrs experience` : ""}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-body-sm text-ink-muted">
                    <MapPin className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                    {travel
                      ? `Base ${describeTravel(travel)} from the community (simulated)`
                      : "No base location: matched by community only"}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {t.specializations.map((s) => (
                      <li
                        key={s}
                        className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-xs text-ink-muted"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-hairline pt-3 text-body-sm">
                    <span className="font-semibold tabular">{t._count.bookings}</span> upcoming session
                    {t._count.bookings === 1 ? "" : "s"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination pathname="/operations/trainers" result={trainers} itemLabel="trainers" />
      </OperationsFilterShell>
    </div>
  );
}

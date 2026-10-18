import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { safely } from "@/lib/utils/errors";
import { getOperationsTrainers } from "@/server/queries/operations";

export const metadata: Metadata = { title: "Trainers" };

export default async function OperationsTrainersPage() {
  const result = await safely(() => getOperationsTrainers());
  if (!result.ok) return <ErrorState message={result.error.message} />;

  return (
    <div>
      <PageHeader title="Trainers" description="Everyone who can be assigned to sessions." />
      <ul className="grid gap-3 md:grid-cols-2">
        {result.data.map((t) => {
          const initials = t.user.name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2);
          return (
            <li key={t.userId} className="flex gap-4 rounded-lg border border-hairline bg-raised p-4">
              <span
                className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand"
                aria-hidden
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{t.user.name}</p>
                  <span
                    className={
                      t.isActive ? "text-body-sm font-semibold text-success" : "text-body-sm text-ink-muted"
                    }
                  >
                    {t.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-body-sm text-ink-muted">
                  {t.serviceZone.name}
                  {t.experienceYears ? ` · ${t.experienceYears} yrs experience` : ""}
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
                <p className="mt-2 text-body-sm">
                  <span className="font-semibold tabular">{t._count.bookings}</span> upcoming session
                  {t._count.bookings === 1 ? "" : "s"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

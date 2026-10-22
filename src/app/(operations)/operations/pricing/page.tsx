import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { PricingEditor } from "@/features/operations/pricing-editor";
import { getDb } from "@/lib/db";
import { calculatePriceBreakdown, formatINR } from "@/lib/pricing";
import { safely } from "@/lib/utils/errors";
import { formatDays, formatSlot, minutesToClock } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { getPricingAdminView } from "@/server/booking/pricing-service";

export const metadata: Metadata = { title: "Pricing rules" };

export default async function PricingPage() {
  const actor = await getActor("OPERATIONS");
  const result = await safely(() => getPricingAdminView(getDb()));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { standard, peak, history } = result.data;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Pricing rules"
        description={`Editing as ${actor.name} (operations). The server prices every new booking from the active rules; existing bookings keep the price they were confirmed at.`}
        className="pb-0"
      />
      {!standard ? (
        <EmptyState title="No active standard rule" body="Run the seed to create the default normal and peak rules." />
      ) : (
        <PricingEditor
          // Remount after a save so the form shows the new versions.
          key={`${standard.id}:${peak?.id ?? "none"}`}
          defaults={{
            standard: { sessionPrice: standard.sessionPrice, commissionPercent: standard.commissionPercent },
            peak: {
              sessionPrice: peak?.sessionPrice ?? standard.sessionPrice,
              commissionPercent: peak?.commissionPercent ?? standard.commissionPercent,
              windows: peak?.windows.length
                ? peak.windows
                : [{ label: "Weekday mornings", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 540 }],
            },
            basedOn: { standardRuleId: standard.id, peakRuleId: peak?.id ?? null },
          }}
        />
      )}

      <section aria-labelledby="history-h" className="grid gap-3">
        <h2 id="history-h" className="text-heading-md font-semibold">
          Version history
        </h2>
        <p className="text-body-sm text-ink-muted">
          Every saved change is a new rule. Bookings point at the version that priced them, which is why the counts
          below never move when prices change.
        </p>
        <div className="overflow-x-auto rounded-lg border border-hairline bg-raised shadow-(--shadow-1)">
          <table className="w-full min-w-[640px] text-left text-body-md">
            <caption className="sr-only">Pricing rule versions</caption>
            <thead className="border-b border-hairline bg-sunken/60 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">Rule</th>
                <th scope="col" className="px-4 py-3">Effective from</th>
                <th scope="col" className="px-4 py-3 text-right">Session</th>
                <th scope="col" className="px-4 py-3 text-right">Customer pays</th>
                <th scope="col" className="px-4 py-3">Windows</th>
                <th scope="col" className="px-4 py-3 text-right">Bookings priced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {history.map((r) => {
                const b = calculatePriceBreakdown(r);
                return (
                  <tr key={r.id} className={r.isActive ? "" : "text-ink-muted"}>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{r.kind === "PEAK" ? "Peak" : "Standard"}</span>{" "}
                      {r.isActive ? (
                        <span className="ml-1 rounded-sm bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success">
                          Active
                        </span>
                      ) : (
                        <span className="ml-1 text-xs">Retired</span>
                      )}
                      <span className="block text-body-sm text-ink-subtle">{r.createdBy ? `by ${r.createdBy}` : "seeded"}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatSlot(r.effectiveFrom)}</td>
                    <td className="px-4 py-3 text-right tabular">
                      {formatINR(b.sessionPrice)}
                      <span className="block text-body-sm text-ink-subtle">+{Number(b.commissionPercent)}%</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular">{formatINR(b.totalAmount)}</td>
                    <td className="px-4 py-3 text-body-sm">
                      {r.windows.length
                        ? r.windows.map((w) => (
                            <span key={w.label} className="block">
                              {w.label}: {formatDays(w.daysOfWeek)} {minutesToClock(w.startMinute)}–{minutesToClock(w.endMinute)}
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular">{r.bookingCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

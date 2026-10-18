import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState, PhaseNote } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculatePriceBreakdown, formatINR } from "@/lib/pricing";
import { safely } from "@/lib/utils/errors";
import { formatDays, formatSlot, minutesToClock } from "@/lib/utils/format";
import { getActivePricing } from "@/server/queries/operations";

export const metadata: Metadata = { title: "Pricing rules" };

export default async function PricingPage() {
  const result = await safely(getActivePricing);
  if (!result.ok) return <ErrorState message={result.error.message} />;

  return (
    <div>
      <PageHeader
        title="Pricing rules"
        description="Active rules used by the server to price new bookings. Existing bookings keep the price they were confirmed at."
      />
      {result.data.length === 0 ? (
        <EmptyState
          title="No active pricing rules"
          body="Run the seed to create the default normal and peak rules."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {result.data.map((rule) => {
            const b = calculatePriceBreakdown(rule);
            return (
              <Card key={rule.id}>
                <CardHeader>
                  <div>
                    <CardTitle>{rule.name}</CardTitle>
                    <p className="text-body-sm text-ink-muted">
                      Effective since {formatSlot(rule.effectiveFrom)}
                    </p>
                  </div>
                  <span
                    className={
                      rule.kind === "PEAK"
                        ? "rounded-sm bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-text"
                        : "rounded-sm bg-sunken px-2 py-1 text-xs font-semibold text-ink-muted"
                    }
                  >
                    {rule.kind === "PEAK" ? "Peak" : "Normal"}
                  </span>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[1fr_auto] gap-y-2">
                    <dt className="text-ink-muted">Session price</dt>
                    <dd className="text-right font-semibold tabular">{formatINR(b.sessionPrice)}</dd>
                    <dt className="text-ink-muted">Society commission</dt>
                    <dd className="text-right font-semibold tabular">
                      {Number(b.commissionPercent)}% · {formatINR(b.commissionAmount)}
                    </dd>
                    <dt className="border-t border-hairline pt-2 font-semibold">Customer pays</dt>
                    <dd className="border-t border-hairline pt-2 text-right text-heading-md font-semibold tabular">
                      {formatINR(b.totalAmount)}
                    </dd>
                  </dl>
                  {rule.peakWindows.length > 0 ? (
                    <div className="mt-5">
                      <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
                        Peak windows (IST)
                      </p>
                      <ul className="mt-2 grid gap-1.5">
                        {rule.peakWindows.map((w) => (
                          <li
                            key={w.id}
                            className="flex justify-between gap-3 rounded-md bg-sunken px-3 py-2 text-body-sm"
                          >
                            <span className="font-semibold">{w.label}</span>
                            <span className="text-ink-muted tabular">
                              {formatDays(w.daysOfWeek)} · {minutesToClock(w.startMinute)}–
                              {minutesToClock(w.endMinute)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-5 text-body-sm text-ink-muted">
                      Applies to any start time outside peak windows.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <div className="mt-6">
        <PhaseNote>
          Editing rules (validated, versioned so past bookings keep their price) from this screen.
        </PhaseNote>
      </div>
    </div>
  );
}

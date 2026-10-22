import {
  Ban,
  Bot,
  CalendarCheck,
  CircleCheck,
  CreditCard,
  HandCoins,
  IndianRupee,
  ListChecks,
  Package,
  PlayCircle,
  Receipt,
  RotateCcw,
  Siren,
  TriangleAlert,
  UserRoundX,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Metric } from "@/components/shared/metric";
import { StatusBadge } from "@/components/shared/status-badge";
import { TrendChart } from "@/components/shared/trend-chart";
import { Card, CardContent, CardHeader, CardIcon, CardLink, CardTitle } from "@/components/ui/card";
import { ScheduleRow } from "@/features/bookings/schedule-row";
import { ReconcileButton } from "@/features/operations/reconcile-button";
import { getDb } from "@/lib/db";
import { localDateKey } from "@/lib/booking/time";
import { calculatePriceBreakdown, formatINR } from "@/lib/pricing";
import { dailySeries } from "@/lib/trend";
import { safely } from "@/lib/utils/errors";
import { DEFAULT_TZ, formatSlot, formatTime } from "@/lib/utils/format";
import { getActivePricingRules } from "@/server/booking/pricing-service";
import { getAiUsage } from "@/server/fitness/fitness-service";
import { getOperationsFinance, getOperationsOverview } from "@/server/queries/operations";
import { getSessionsNeedingAttention } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "Operations overview" };

export default async function OperationsOverviewPage() {
  const result = await safely(async () => {
    const db = getDb();
    const [overview, finance, attention, pricing, ai] = await Promise.all([
      getOperationsOverview(),
      getOperationsFinance(),
      getSessionsNeedingAttention(db, new Date()),
      getActivePricingRules(db),
      getAiUsage(db),
    ]);
    return { ...overview, finance, attention, pricing, ai };
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const {
    counts,
    unassigned,
    unassignedCount,
    recent,
    activeTrainers,
    finance,
    attention,
    pricing,
    ai,
    trendBookings,
    trendRevenue,
  } = result.data;
  const todayKey = localDateKey(new Date(), DEFAULT_TZ);
  const bookingSeries = dailySeries(
    trendBookings.map((at) => ({ at, value: 1 })),
    todayKey,
    DEFAULT_TZ,
    28,
  );
  const revenueSeries = dailySeries(
    trendRevenue.map((p) => ({ at: p.at, value: Number(p.amount) })),
    todayKey,
    DEFAULT_TZ,
    28,
  );
  const bookingTrend = bookingSeries.slice(-14);
  const revenueTrend = revenueSeries.slice(-14);
  const previousBookings = bookingSeries.slice(0, 14).reduce((n, p) => n + p.value, 0);
  const previousRevenue = revenueSeries.slice(0, 14).reduce((n, p) => n + p.value, 0);
  const revenueTotal = revenueTrend.reduce((n, p) => n + p.value, 0);
  const total = Object.values(counts).reduce<number>((s, n) => s + (n ?? 0), 0);
  const needsAttention = attention.overdueCount + attention.notStartedCount;
  const packageFigures: Array<[string, number]> = [
    ["Active", finance.packages.active],
    ["Sessions left", finance.packages.sessionsRemaining],
    ["Used up / expired", finance.packages.exhausted + finance.packages.expired],
    ["Awaiting payment", finance.packages.pendingPayment],
  ];
  const paymentLabel = {
    SUCCEEDED: "Succeeded",
    FAILED: "Declined",
    REFUNDED: "Refunded",
    PENDING: "Pending",
  } as const;
  const paymentTone = {
    SUCCEEDED: "text-success",
    FAILED: "text-danger",
    REFUNDED: "text-ink-muted",
    PENDING: "text-ink-muted",
  } as const;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Overview"
        description="Every figure is read live from persisted records (seeded demo data plus anything booked in the app). All money is simulated."
        className="pb-0"
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Total bookings" value={<AnimatedNumber value={total} />} icon={ListChecks} />
        <Metric label="Confirmed" value={<AnimatedNumber value={counts.CONFIRMED ?? 0} />} icon={CalendarCheck} />
        <Metric
          label="In progress"
          value={<AnimatedNumber value={counts.IN_PROGRESS ?? 0} />}
          icon={PlayCircle}
          tone="accent"
        />
        <Metric
          label="Completed"
          value={<AnimatedNumber value={counts.COMPLETED ?? 0} />}
          icon={CircleCheck}
          tone="success"
        />
        <Metric
          label="Cancelled / failed"
          value={<AnimatedNumber value={(counts.CANCELLED ?? 0) + (counts.FAILED ?? 0)} />}
          foot={`${counts.FAILED ?? 0} with a declined payment`}
          icon={Ban}
          tone="muted"
        />
      </div>

      <section aria-labelledby="trend-h" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="trend-h" className="text-heading-md font-semibold">
            Last 14 days
          </h2>
          <p className="text-body-sm text-ink-muted">
            Bookings created and successful simulated payments, by day.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Bookings created</CardTitle>
                <p className="text-body-sm text-ink-muted">New bookings per day, by creation time.</p>
              </div>
              <CardIcon icon={ListChecks} />
            </CardHeader>
            <CardContent>
              <TrendChart
                points={bookingTrend}
                label="Bookings created"
                total={`${bookingTrend.reduce((n, p) => n + p.value, 0)} bookings`}
                valueNoun="booking"
                previousTotal={previousBookings}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Payments received</CardTitle>
                <p className="text-body-sm text-ink-muted">
                  Successful simulated payments per day, before refunds.
                </p>
              </div>
              <CardIcon icon={Wallet} />
            </CardHeader>
            <CardContent>
              <TrendChart
                points={revenueTrend}
                label="Payments received"
                total={formatINR(revenueTotal.toFixed(2))}
                currency
                valueNoun="payment"
                previousTotal={previousRevenue}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="money-h" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="money-h" className="text-heading-md font-semibold">
            Payments and commission <span className="font-normal text-ink-muted">(simulated)</span>
          </h2>
          <p className="text-body-sm text-ink-muted">
            Sums of persisted payment records. No real money moved.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Successful payments"
            value={<AnimatedNumber value={Number(finance.succeeded.total)} currency />}
            foot={`${finance.payments.SUCCEEDED?.count ?? 0} payments · ${finance.succeeded.packageCount} for packages`}
            icon={CreditCard}
            tone="success"
          />
          <Metric
            label="Society commission"
            value={<AnimatedNumber value={Number(finance.succeeded.commission)} currency />}
            foot="From successful payments; package sessions count once, at purchase"
            icon={HandCoins}
          />
          <Metric
            label="Net after commission"
            value={<AnimatedNumber value={Number(finance.succeeded.net)} currency />}
            foot="Session and package prices, excluding commission"
            icon={Wallet}
          />
          <Metric
            label="Declined / refunded"
            value={`${finance.payments.FAILED?.count ?? 0} / ${finance.payments.REFUNDED?.count ?? 0}`}
            foot={`${formatINR(finance.payments.REFUNDED?.amount ?? "0.00")} refunded on cancellations`}
            icon={RotateCcw}
            tone="muted"
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Packages</CardTitle>
              <p className="text-body-sm text-ink-muted">Customer-owned packages, from package records.</p>
            </div>
            <CardIcon icon={Package} />
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {packageFigures.map(([label, value]) => (
                <div key={label} className="rounded-md border border-hairline bg-surface px-3 py-2.5">
                  <dt className="text-body-sm text-ink-muted">{label}</dt>
                  <dd className="text-heading-lg font-semibold tabular">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI workout recommendations</CardTitle>
              <p className="text-body-sm text-ink-muted">
                Counts from the recommendation request log. Fallbacks are the deterministic templates.
              </p>
            </div>
            <CardIcon icon={Bot} />
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-2.5">
              <div className="rounded-md border border-hairline bg-surface px-3 py-2.5">
                <dt className="text-body-sm text-ink-muted">AI-generated</dt>
                <dd className="text-heading-lg font-semibold tabular">{ai.aiSuccess}</dd>
              </div>
              <div className="rounded-md border border-hairline bg-surface px-3 py-2.5">
                <dt className="text-body-sm text-ink-muted">Rule-based fallback</dt>
                <dd className="text-heading-lg font-semibold tabular">{ai.fallback}</dd>
              </div>
              <div className="rounded-md border border-hairline bg-surface px-3 py-2.5">
                <dt className="text-body-sm text-ink-muted">AI attempts failed</dt>
                <dd className="text-heading-lg font-semibold tabular">{ai.aiFailed}</dd>
              </div>
            </dl>
            <p className="mt-3 text-body-sm text-ink-muted">
              {ai.measured.calls > 0
                ? `Measured over ${ai.measured.calls} AI call${ai.measured.calls === 1 ? "" : "s"}: ${(
                    (ai.measured.avgLatencyMs ?? 0) / 1000
                  ).toFixed(1)} s average latency${
                    ai.measured.avgInputTokens !== null && ai.measured.avgOutputTokens !== null
                      ? `, ${ai.measured.avgInputTokens} input / ${ai.measured.avgOutputTokens} output tokens on average`
                      : ""
                  }.`
                : "No AI call has been measured yet."}
            </p>
            {ai.recentFailures.length > 0 ? (
              <ul className="mt-3 grid gap-1 border-t border-hairline pt-3">
                {ai.recentFailures.map((f, i) => (
                  <li key={i} className="text-body-sm text-ink-muted">
                    {formatSlot(f.at)} · {f.source === "AI" ? "AI" : "fallback"} · {f.kind}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-t border-hairline pt-3 text-body-sm text-ink-muted">
                No failures logged. Every generation attempt is recorded, so zero here means none failed.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pricing now</CardTitle>
              <p className="text-body-sm text-ink-muted">Active rules used to price new bookings.</p>
            </div>
            <CardIcon icon={IndianRupee} />
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-y-2">
              {[pricing.standard, pricing.peak].map((r) =>
                r ? (
                  <div key={r.id} className="contents">
                    <dt className="text-ink-muted">
                      {r.kind === "PEAK" ? "Peak" : "Standard"}
                      <span className="block text-body-sm text-ink-subtle">
                        {formatINR(r.sessionPrice)} + {Number(r.commissionPercent)}% commission
                      </span>
                    </dt>
                    <dd className="text-right font-semibold tabular">
                      {formatINR(calculatePriceBreakdown(r).totalAmount)}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
            <div className="mt-4 border-t border-hairline pt-3">
              <CardLink href="/operations/pricing">Edit pricing rules</CardLink>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Siren className="size-4 text-warning" aria-hidden /> Sessions needing attention
              </CardTitle>
              <p className="text-body-sm text-ink-muted">
                In progress past their 60-minute end but not yet closed, or confirmed and never started.
                Warnings and completions are applied when an affected page is opened, by the cron endpoint, or
                with this button.
              </p>
            </div>
            <ReconcileButton />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {needsAttention === 0 ? (
              <div className="px-5 pb-3">
                <EmptyState
                  title="Nothing overdue"
                  body="Every in-progress session is within its 60 minutes."
                />
              </div>
            ) : (
              <ul className="divide-y divide-hairline">
                {attention.overdue.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <span className="tabular">{b.reference}</span> · {b.customer.user.name} with{" "}
                        {b.trainer?.user.name ?? "—"}
                      </p>
                      <p className="text-body-sm text-ink-muted">
                        Should have ended at {b.sessionRecord ? formatTime(b.sessionRecord.endsAt) : "—"};
                        awaiting reconciliation
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
                {attention.notStarted.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <span className="tabular">{b.reference}</span> · {b.customer.user.name} with{" "}
                        {b.trainer?.user.name ?? "—"}
                      </p>
                      <p className="text-body-sm text-ink-muted">
                        Scheduled {formatSlot(b.startAt)}; the start window closed without a start
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">
                      <TriangleAlert className="size-3.5" aria-hidden /> Not started
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserRoundX className="size-4 text-ink-subtle" aria-hidden /> Needs a trainer
              </CardTitle>
              <p className="text-body-sm text-ink-muted">
                {activeTrainers} active trainers across all communities
              </p>
            </div>
            {unassignedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">
                <TriangleAlert className="size-3.5" aria-hidden /> {unassignedCount} unassigned
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {unassignedCount > 0 ? (
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
            <CardTitle>Recent payments</CardTitle>
            <CardIcon icon={Receipt} />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {finance.recent.length === 0 ? (
              <p className="px-5 pb-3 text-ink-muted">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {finance.recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {p.what} · {p.customer}
                      </p>
                      <p className="text-body-sm text-ink-muted">
                        {formatSlot(p.createdAt)}
                        {p.commission ? ` · ${formatINR(p.commission)} commission` : ""}
                      </p>
                    </div>
                    <span className="text-right">
                      <span className="block font-semibold tabular">{formatINR(p.amount)}</span>
                      <span className={`text-xs font-semibold ${paymentTone[p.status]}`}>
                        {paymentLabel[p.status]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardIcon icon={ListChecks} />
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

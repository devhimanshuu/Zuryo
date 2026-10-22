import { ArrowRight, CalendarPlus, FlaskConical, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState, ErrorState, Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageMeter } from "@/features/customers/package-meter";
import { ChoosePlanButton } from "@/features/packages/choose-plan-button";
import { PackageStatusBadge } from "@/features/packages/package-status-badge";
import { getDb } from "@/lib/db";
import { parsePage } from "@/lib/pagination";
import { cn } from "@/lib/utils/cn";
import { formatINR } from "@/lib/pricing";
import { safely } from "@/lib/utils/errors";
import { formatDay, formatSlot } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { getCustomerPackages, listPlans } from "@/server/packages/package-service";

export const metadata: Metadata = { title: "Packages" };

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string; page?: string }>;
}) {
  const actor = await getActor("CUSTOMER");
  const now = new Date();
  const { purchased, page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const result = await safely(async () => {
    const db = getDb();
    const [owned, catalogue] = await Promise.all([
      getCustomerPackages(db, actor.userId, now, page),
      listPlans(db, now),
    ]);
    return { owned, catalogue };
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { owned, catalogue } = result.data;
  // Fetched independently of the page so the receipt shows on whatever page it lands on.
  const justBought = purchased
    ? await getDb().package.findFirst({
        where: { id: purchased, customerId: actor.userId, status: { not: "PENDING_PAYMENT" } },
      })
    : null;
  // "Best value" is the lowest price per session among plans that actually save money; no claim otherwise.
  const bestValueId =
    catalogue.plans.length > 1
      ? catalogue.plans
          .filter((p) => p.quote.savings)
          .sort((a, b) => Number(a.quote.perSessionBase) - Number(b.quote.perSessionBase))[0]?.id
      : undefined;

  return (
    <div className="grid gap-10">
      <PageHeader
        editorial
        title="Packages"
        description={`Buy sessions in advance and use one per booking. Showing packages for ${actor.name}.`}
        className="pb-0"
      />

      {justBought ? (
        <Notice tone="success" title={`${justBought.name} is ready`} live>
          {justBought.totalSessions} session{justBought.totalSessions === 1 ? "" : "s"} added
          {justBought.expiresAt ? `, valid until ${formatDay(justBought.expiresAt)}` : ""}. Choose it when you
          book a session.
        </Notice>
      ) : null}

      <section aria-labelledby="owned-h" className="grid gap-4">
        <h2 id="owned-h" className="text-heading-md font-semibold">
          Your packages
        </h2>
        {owned.rows.length === 0 ? (
          <EmptyState
            title="No packages yet"
            body="Buy a package below and use one session each time you book. You can still pay per session."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {owned.rows.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{p.name}</CardTitle>
                    <p className="text-body-sm text-ink-muted">
                      {p.status === "PENDING_PAYMENT"
                        ? `Checkout started ${formatDay(p.createdAt)}`
                        : `Bought ${formatDay(p.purchasedAt)}${p.expiresAt ? ` · valid until ${formatDay(p.expiresAt)}` : ""}`}
                    </p>
                  </div>
                  <PackageStatusBadge status={p.effectiveStatus} />
                </CardHeader>
                <CardContent className="grid gap-4">
                  {p.status === "PENDING_PAYMENT" ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning-soft px-3 py-2.5 text-body-sm text-warning">
                      <span>Not paid yet, so it can&apos;t be used for bookings.</span>
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/customer/packages/checkout/${p.id}`}>
                          Finish checkout <ArrowRight aria-hidden />
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <PackageMeter
                      name={`${p.remaining} of ${p.totalSessions} left`}
                      total={p.totalSessions}
                      used={p.usedSessions}
                    />
                  )}
                  <p className="text-body-sm text-ink-muted">
                    {p.status === "PENDING_PAYMENT" ? "Price " : "Paid "}
                    <span className="font-semibold text-ink tabular">{formatINR(p.pricePaid)}</span>
                    {p.commissionAmount ? (
                      <> (incl. {formatINR(p.commissionAmount)} society commission)</>
                    ) : null}
                    {p.payments.some((x) => x.status === "SUCCEEDED") ? " · simulated payment" : ""}
                  </p>
                  {p.entries.length > 0 ? (
                    <details className="rounded-md bg-sunken px-3 py-2 text-body-sm">
                      <summary className="cursor-pointer font-semibold">
                        Usage history ({p.entries.length})
                      </summary>
                      <ol className="mt-2 grid gap-1.5">
                        {p.entries.map((e) => (
                          <li key={e.id} className="flex flex-wrap justify-between gap-x-3">
                            <span>
                              {e.reason === "BOOKING_DEBIT"
                                ? "Used for "
                                : e.reason === "CANCELLATION_REFUND"
                                  ? "Returned from "
                                  : "Adjustment "}
                              {e.booking ? (
                                <Link
                                  href={`/customer/bookings/${e.booking.id}`}
                                  className="font-semibold hover:underline"
                                >
                                  {e.booking.reference}
                                </Link>
                              ) : null}
                              {e.booking ? (
                                <span className="text-ink-muted"> · {formatSlot(e.booking.startAt)}</span>
                              ) : null}
                            </span>
                            <span className="text-ink-muted tabular">
                              {e.delta > 0 ? "+" : "−"}
                              {Math.abs(e.delta)} · {formatDay(e.createdAt)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Pagination
          pathname="/customer/packages"
          searchParams={{ purchased }}
          result={owned}
          itemLabel="packages"
        />
      </section>

      <section aria-labelledby="buy-h" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="buy-h" className="text-heading-md font-semibold">
              Buy a package
            </h2>
            <p className="text-body-sm text-ink-muted">
              One package session covers any 60-minute session, standard or peak. Totals include the society
              commission shown under each price.
            </p>
          </div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-body-sm font-semibold text-accent-text">
            <FlaskConical className="size-4" aria-hidden /> Demo checkout — no real money is charged
          </p>
        </div>
        {catalogue.plans.length === 0 ? (
          <EmptyState title="No packages on sale" body="Operations hasn't published any packages yet." />
        ) : (
          <ul className="grid gap-4 pt-2 md:grid-cols-3">
            {catalogue.plans.map((plan) => (
              <li key={plan.id} className="relative">
                {plan.id === bestValueId ? (
                  <span className="absolute -top-3 left-5 z-10 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-on-brand shadow-(--shadow-2)">
                    <Sparkles className="size-3.5" aria-hidden /> Best value
                  </span>
                ) : null}
                <Card
                  className={cn(
                    "flex h-full flex-col transition-shadow duration-200 hover:shadow-(--shadow-2)",
                    plan.id === bestValueId && "border-brand/50 shadow-(--shadow-2) ring-1 ring-brand/40",
                  )}
                >
                  <CardHeader className={plan.id === bestValueId ? "pt-6" : undefined}>
                    <div>
                      <CardTitle>{plan.name}</CardTitle>
                      <p className="text-body-sm text-ink-muted">
                        {plan.sessionCount} session{plan.sessionCount === 1 ? "" : "s"} · valid{" "}
                        {plan.validityDays} days
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="grid flex-1 content-start gap-3">
                    {plan.description ? (
                      <p className="text-body-sm text-ink-muted">{plan.description}</p>
                    ) : null}
                    <p className="flex items-baseline gap-2">
                      <span className="text-numeric-lg font-semibold tracking-tight tabular">
                        {formatINR(plan.quote.totalAmount)}
                      </span>
                      <span className="text-body-sm text-ink-muted">total</span>
                    </p>
                    <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-body-sm">
                      <dt className="text-ink-muted">Package price</dt>
                      <dd className="text-right tabular">{formatINR(plan.quote.basePrice)}</dd>
                      <dt className="text-ink-muted">
                        Society commission ({Number(plan.quote.commissionPercent)}%)
                      </dt>
                      <dd className="text-right tabular">{formatINR(plan.quote.commissionAmount)}</dd>
                      <dt className="text-ink-muted">Per session (before commission)</dt>
                      <dd className="text-right tabular">{formatINR(plan.quote.perSessionBase)}</dd>
                    </dl>
                    {plan.quote.savings ? (
                      <p className="rounded-sm bg-success-soft px-2 py-1 text-body-sm text-success">
                        {formatINR(plan.quote.savings)} less than {plan.sessionCount} standard sessions at
                        today&apos;s {formatINR(catalogue.standardSessionPrice)} rate
                      </p>
                    ) : null}
                  </CardContent>
                  <CardFooter>
                    <ChoosePlanButton planId={plan.id} planName={plan.name} />
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <p className="text-body-sm text-ink-subtle">
          Validity starts when the payment succeeds. A cancelled booking returns its session to the package.
        </p>
      </section>

      <div>
        <Button asChild variant="secondary">
          <Link href="/customer/bookings/new">
            <CalendarPlus aria-hidden /> Book a session
          </Link>
        </Button>
      </div>
    </div>
  );
}

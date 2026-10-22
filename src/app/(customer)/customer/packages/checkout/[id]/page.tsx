import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageCheckoutForm } from "@/features/packages/package-checkout-form";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/pricing";
import { safely } from "@/lib/utils/errors";
import { formatSlot } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { getCheckout } from "@/server/packages/package-service";

export const metadata: Metadata = { title: "Checkout" };

export default async function PackageCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor("CUSTOMER");
  // Scoped to the acting customer: another customer's checkout id is simply not found.
  const result = await safely(() => getCheckout(getDb(), actor, id));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const pkg = result.data;
  if (!pkg) notFound();

  const pending = pkg.status === "PENDING_PAYMENT";
  const declined = pkg.payments.filter((p) => p.status === "FAILED");

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        editorial
        back={{ href: "/customer/packages", label: "Packages" }}
        title={pending ? "Checkout" : "Package paid"}
        description={`${pkg.name} for ${actor.name}. The price was fixed when checkout started.`}
        className="pb-0"
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{pkg.name}</CardTitle>
            <p className="text-body-sm text-ink-muted">
              {pkg.totalSessions} session{pkg.totalSessions === 1 ? "" : "s"}
              {pkg.validityDays ? ` · valid ${pkg.validityDays} days from payment` : ""}
            </p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {pkg.plan?.description ? <p className="text-body-sm text-ink-muted">{pkg.plan.description}</p> : null}
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
            <dt className="text-ink-muted">Package price</dt>
            <dd className="text-right font-semibold tabular">{formatINR(pkg.basePrice ?? pkg.pricePaid)}</dd>
            <dt className="text-ink-muted">
              Society commission{pkg.commissionPercent ? ` (${Number(pkg.commissionPercent)}%)` : ""}
            </dt>
            <dd className="text-right font-semibold tabular">{formatINR(pkg.commissionAmount ?? "0.00")}</dd>
            <dt className="mt-1 border-t border-hairline pt-3 font-semibold">Total to pay</dt>
            <dd className="mt-1 border-t border-hairline pt-3 text-right text-numeric-lg font-semibold tracking-tight tabular">
              {formatINR(pkg.pricePaid)}
            </dd>
          </dl>
          <p className="text-body-sm text-ink-subtle">
            The commission goes to your community; the package price goes to Zuryo and its trainers.
          </p>
        </CardContent>
      </Card>

      {declined.length > 0 && pending ? (
        <Notice tone="warning" title={`${declined.length} declined attempt${declined.length === 1 ? "" : "s"}`}>
          Last declined {formatSlot(declined[0]!.createdAt)}. Declined payments are recorded but never activate a
          package.
        </Notice>
      ) : null}

      {pending ? (
        <PackageCheckoutForm packageId={pkg.id} total={pkg.pricePaid.toString()} />
      ) : pkg.status === "CANCELLED" ? (
        <Notice tone="info" title="This checkout was discarded">
          Start a new one from Packages if you still want this package.
        </Notice>
      ) : (
        <div className="grid gap-4">
          <Notice tone="success" title="Paid (simulated)">
            <span className="inline-flex items-center gap-1">
              <CircleCheck className="size-4" aria-hidden />
              This package is active on your account. Paying again isn&apos;t possible.
            </span>
          </Notice>
          <div>
            <Button asChild variant="primary">
              <Link href="/customer/packages">See my packages</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

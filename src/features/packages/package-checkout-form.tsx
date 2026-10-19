"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/pricing";
import type { SimulatedOutcome } from "@/lib/validation/payments";
import { discardCheckoutAction, payForPackageAction } from "@/server/actions/packages";
import { SimulatedOutcomePicker } from "../payments/simulated-outcome-picker";

/**
 * Pays for a pending package. Each attempt carries one idempotency key; a double click or a retry
 * after a dropped response reuses it, so the server answers once. A new attempt (after a decline,
 * or with a different outcome) gets a new key.
 */
export function PackageCheckoutForm({ packageId, total }: { packageId: string; total: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<SimulatedOutcome>("SUCCEED");
  const [error, setError] = useState<string | null>(null);
  const [paying, startPaying] = useTransition();
  const [discarding, startDiscarding] = useTransition();
  const attempt = useRef<{ outcome: SimulatedOutcome; key: string } | null>(null);

  function pay() {
    setError(null);
    if (attempt.current?.outcome !== outcome) attempt.current = { outcome, key: crypto.randomUUID() };
    const { key } = attempt.current;
    startPaying(async () => {
      try {
        const res = await payForPackageAction({ packageId, outcome, idempotencyKey: key });
        if (!res.ok) {
          setError(res.error.message);
          if (res.error.code === "PAYMENT_FAILED") attempt.current = null; // next try is a new attempt
          router.refresh();
          return;
        }
        router.push(`/customer/packages?purchased=${packageId}`);
      } catch {
        setError("We couldn't reach Zuryo, so we can't confirm the payment. Try again; you won't be charged twice.");
      }
    });
  }

  return (
    <div className="grid gap-4">
      <SimulatedOutcomePicker name="package-outcome" value={outcome} onChange={setOutcome} />
      {error ? (
        <Notice tone="danger" title="Payment not completed" live>
          {error}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          disabled={paying}
          loading={discarding}
          onClick={() =>
            startDiscarding(async () => {
              try {
                const res = await discardCheckoutAction({ packageId });
                if (!res.ok) {
                  toast.error(res.error.message);
                  return;
                }
                router.push("/customer/packages");
              } catch {
                toast.error("We couldn't reach Zuryo. Check your connection and try again.");
              }
            })
          }
        >
          Discard checkout
        </Button>
        <Button variant="primary" size="lg" loading={paying} disabled={discarding} onClick={pay}>
          {paying ? "Processing…" : `Pay ${formatINR(total)} (simulated)`}
        </Button>
      </div>
    </div>
  );
}

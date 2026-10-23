"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startPackageCheckoutAction } from "@/server/actions/packages";

/** Starts (or resumes, on retry) a checkout for a plan and opens it. */
export function ChoosePlanButton({ planId, planName }: { planId: string; planName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const key = useRef<string | null>(null);
  return (
    <Button
      variant="primary"
      className="w-full"
      loading={pending}
      aria-label={`Choose ${planName}`}
      onClick={() =>
        startTransition(async () => {
          key.current ??= crypto.randomUUID();
          try {
            const res = await startPackageCheckoutAction({ planId, checkoutKey: key.current });
            if (!res.ok) {
              toast.error(res.error.message);
              return;
            }
            router.push(`/customer/packages/checkout/${res.data.packageId}`);
          } catch {
            toast.error("We couldn't reach ZuryoFit. Check your connection and try again.");
          }
        })
      }
    >
      Choose {!pending ? <ArrowRight aria-hidden /> : null}
    </Button>
  );
}

"use client";

import { TimerReset } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reconcileSessionsAction } from "@/server/actions/operations";

/** Runs the same idempotent lifecycle reconciliation as the cron endpoint, on demand. */
export function ReconcileButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      className="h-auto min-h-9 max-w-full shrink py-1.5 text-left whitespace-normal"
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await reconcileSessionsAction();
            if (!res.ok) {
              toast.error(res.error.message);
              return;
            }
            const { checked, warned, completed } = res.data;
            toast.success("Reconciliation finished", {
              description: `${checked} session${checked === 1 ? "" : "s"} checked · ${warned} warning${warned === 1 ? "" : "s"} sent · ${completed} completed.`,
            });
            router.refresh();
          } catch {
            toast.error("We couldn't reach ZuryoFit. Check your connection and try again.");
          }
        })
      }
    >
      {!pending ? <TimerReset aria-hidden /> : null} Run session reconciliation
    </Button>
  );
}

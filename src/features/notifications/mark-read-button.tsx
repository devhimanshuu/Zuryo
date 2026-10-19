"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  markCustomerNotificationsReadAction,
  markTrainerNotificationsReadAction,
} from "@/server/actions/notifications";

export function MarkReadButton({ as, disabled }: { as: "CUSTOMER" | "TRAINER"; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const action = as === "TRAINER" ? markTrainerNotificationsReadAction : markCustomerNotificationsReadAction;
            const res = await action();
            if (!res.ok) {
              toast.error(res.error.message);
              return;
            }
            router.refresh();
          } catch {
            toast.error("We couldn't reach Zuryo. Check your connection and try again.");
          }
        })
      }
    >
      {!pending ? <CheckCheck aria-hidden /> : null} Mark all as read
    </Button>
  );
}

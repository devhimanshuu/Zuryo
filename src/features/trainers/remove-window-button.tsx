"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeAvailabilityAction } from "@/server/actions/availability";

export function RemoveWindowButton({ availabilityId, label }: { availabilityId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={`Remove ${label}`}
      title="Remove"
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await removeAvailabilityAction({ availabilityId });
            if (!res.ok) {
              toast.error(res.error.message);
              return;
            }
            toast.success("Time window removed");
            router.refresh();
          } catch {
            toast.error("We couldn't reach Zuryo. Check your connection and try again.");
          }
        })
      }
      className="grid size-8 shrink-0 place-items-center rounded-sm text-current/80 hover:bg-raised/70 hover:text-current disabled:opacity-50"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

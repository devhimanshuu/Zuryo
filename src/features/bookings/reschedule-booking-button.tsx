"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/pricing";
import { formatSlot } from "@/lib/utils/format";
import { getRescheduleOptionsAction, rescheduleBookingAction } from "@/server/actions/bookings";
import type { RescheduleOptions } from "@/server/booking/reschedule-service";
import { SlotPicker } from "./wizard/slot-picker";

/**
 * Move a confirmed booking to another time. The dialog loads the server's slot grid for this
 * booking (its own slot doesn't block it; paid bookings only see same-price times as open), and the
 * server re-checks everything when the customer confirms.
 */
export function RescheduleBookingButton({ bookingId, reference }: { bookingId: string; reference: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<RescheduleOptions | null>(null);
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getRescheduleOptionsAction({ bookingId });
      if (!res.ok) {
        setError(res.error.message);
        setOptions(null);
        return;
      }
      setOptions(res.data);
      const firstOpen = res.data.schedule.days.find((d) => d.availableCount > 0);
      setDateKey((k) => k ?? firstOpen?.dateKey ?? res.data.schedule.days[0]?.dateKey ?? null);
    } catch {
      setError("We couldn't reach ZuryoFit. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await rescheduleBookingAction({ bookingId, startAt: selected });
      if (!res.ok) {
        setError(res.error.message);
        setSelected(null);
        await load(); // the grid may have changed under us
        return;
      }
      toast.success(`Booking ${res.data.reference} moved`, {
        description: res.data.trainerChanged
          ? `${res.data.trainerName} will train you at the new time. Both trainers have been notified.`
          : `${res.data.trainerName} has been notified.`,
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError("We couldn't reach ZuryoFit, so the booking wasn't moved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
        else {
          setSelected(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="md">
          <CalendarClock aria-hidden /> Reschedule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle>Move {reference}</DialogTitle>
        <DialogDescription>
          {options
            ? `Currently ${formatSlot(new Date(options.currentStartAt), options.schedule.timeZone)}${options.trainerName ? ` with ${options.trainerName}` : ""}. ${
                options.requiredTotal
                  ? `You paid ${formatINR(options.requiredTotal)}, so times at that price are open.`
                  : "Covered by your package, so any open time works."
              } ${options.reschedulesLeft} move${options.reschedulesLeft === 1 ? "" : "s"} left.`
            : "Pick a new time for this session."}
        </DialogDescription>

        <div className="mt-5 grid gap-4">
          {error ? (
            <Notice tone="danger" live>
              {error}
            </Notice>
          ) : null}
          {loading && !options ? (
            <div className="grid gap-3" aria-busy="true">
              <Skeleton className="h-16" />
              <Skeleton className="h-40" />
            </div>
          ) : options ? (
            <SlotPicker
              schedule={options.schedule}
              dateKey={dateKey}
              selected={selected}
              onDate={(k) => {
                setDateKey(k);
                setSelected(null);
              }}
              onSelect={setSelected}
              onRefresh={() => void load()}
            />
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep current time
            </Button>
            <Button type="button" variant="primary" disabled={!selected} loading={saving} onClick={() => void confirm()}>
              {selected && options
                ? `Move to ${formatSlot(new Date(selected), options.schedule.timeZone)}`
                : "Choose a new time"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

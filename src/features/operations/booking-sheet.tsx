"use client";

import { CalendarClock, ChevronRight, Loader2, MapPin, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CANCELLATION_REASON_MAX_LENGTH } from "@/lib/booking/rules";
import { formatINR } from "@/lib/pricing";
import { formatSlot } from "@/lib/utils/format";
import {
  cancelOperationsBookingAction,
  getOperationsBookingDetailAction,
  reassignBookingAction,
} from "@/server/actions/operations";

type Detail = Extract<
  Awaited<ReturnType<typeof getOperationsBookingDetailAction>>,
  { ok: true }
>["data"];

/** Operations drill-down: booking history, reassignment and cancellation with a reason. */
export function OperationsBookingSheet({ bookingId, reference }: { bookingId: string; reference: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reassign" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [trainerId, setTrainerId] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const res = await getOperationsBookingDetailAction(bookingId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setDetail(res.data);
    setTrainerId(res.data.trainer?.userId ?? "");
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    setActionError(null);
    if (next && !detail) void load();
    if (!next) {
      setDetail(null);
      setError(null);
      setTrainerId("");
      setNote("");
      setReason("");
    }
  }

  async function reassign(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || !trainerId) return;
    setBusy("reassign");
    setActionError(null);
    const res = await reassignBookingAction({
      bookingId,
      trainerId,
      note: note || undefined,
    });
    setBusy(null);
    if (!res.ok) {
      setActionError(res.error.message);
      return;
    }
    toast.success(`Booking ${res.data.reference} reassigned`, {
      description: res.data.unchanged ? "It was already with that trainer." : `Now with ${res.data.trainerName}. The customer and both trainers have been notified.`,
    });
    setNote("");
    await load();
    router.refresh();
  }

  async function cancel(event: React.FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setBusy("cancel");
    setActionError(null);
    const res = await cancelOperationsBookingAction({ bookingId, reason });
    setBusy(null);
    if (!res.ok) {
      setActionError(res.error.message);
      return;
    }
    toast.success(`Booking ${res.data.reference} cancelled`, {
      description: res.data.refundedAmount
        ? `The simulated payment of ${formatINR(res.data.refundedAmount)} was refunded.`
        : res.data.restoredSession
          ? "The package session was returned."
          : "The slot is free again.",
    });
    setReason("");
    await load();
    router.refresh();
  }

  const mutable = detail && (detail.status === "PENDING" || detail.status === "CONFIRMED");
  const future = detail ? Date.parse(detail.startAt) > Date.now() : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2" aria-label={`Manage booking ${reference}`}>
          Manage <ChevronRight aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent side="right" className="p-0">
        <div className="sticky top-0 z-10 border-b border-hairline bg-raised/95 px-6 py-4 pr-14 backdrop-blur">
          <DialogTitle className="text-heading-md">Booking {reference}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${formatSlot(new Date(detail.startAt), detail.zone.timezone)} · ${detail.zone.name}`
              : "Session details, history and operations actions."}
          </DialogDescription>
        </div>

        <div className="grid gap-6 px-6 py-5">
          {loading && !detail ? (
            <p className="inline-flex items-center gap-2 text-body-sm text-ink-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading booking…
            </p>
          ) : error ? (
            <Notice tone="danger" live>
              {error}{" "}
              <button type="button" onClick={() => void load()} className="font-semibold underline">
                Try again
              </button>
            </Notice>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={detail.status} rescheduled={detail.activity.some((a) => a.label === "Booking moved")} />
                <span className="text-body-sm text-ink-muted">{detail.coverage}</span>
              </div>

              <dl className="grid gap-x-4 gap-y-2 text-body-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-ink-muted">Customer</dt>
                <dd>
                  {detail.customer.name}
                  {detail.customer.email ? (
                    <span className="block text-ink-subtle">{detail.customer.email}</span>
                  ) : null}
                </dd>
                <dt className="text-ink-muted">Trainer</dt>
                <dd>
                  {detail.trainer?.name ?? <span className="font-semibold text-warning">Unassigned</span>}
                </dd>
                <dt className="text-ink-muted">Workout</dt>
                <dd>{detail.workoutCategory?.replaceAll("_", " ").toLowerCase() ?? "Unknown"}</dd>
                <dt className="text-ink-muted">Price</dt>
                <dd>
                  {formatINR(detail.totalAmount)}
                  <span className="block text-ink-subtle">
                    {detail.pricingRule}
                    {detail.isPeak ? " · peak" : ""}
                  </span>
                </dd>
                {detail.package ? (
                  <>
                    <dt className="text-ink-muted">Package</dt>
                    <dd>
                      {detail.package.name} · {detail.package.usedSessions}/{detail.package.totalSessions} used
                    </dd>
                  </>
                ) : null}
                {detail.notes ? (
                  <>
                    <dt className="text-ink-muted">Customer note</dt>
                    <dd>{detail.notes}</dd>
                  </>
                ) : null}
              </dl>

              {detail.cancellation ? (
                <Notice tone="warning" title="Cancelled">
                  {formatSlot(new Date(detail.cancellation.at), detail.zone.timezone)}
                  {detail.cancellation.reason ? ` · ${detail.cancellation.reason}` : ""}
                  {detail.cancellation.by ? ` · by ${detail.cancellation.by}` : ""}
                </Notice>
              ) : null}

              {actionError ? (
                <Notice tone="danger" live>
                  {actionError}
                </Notice>
              ) : null}

              {mutable && future ? (
                <div className="grid gap-6">
                  <form onSubmit={reassign} className="grid gap-3 rounded-lg border border-hairline p-4">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold">
                        <UserRound className="size-4 text-brand" aria-hidden /> Reassign trainer
                      </h3>
                      <p className="text-body-sm text-ink-muted">
                        The time and price stay the same. We re-check the trainer&apos;s availability first.
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`trainer-${bookingId}`}>Trainer</Label>
                      <Select
                        id={`trainer-${bookingId}`}
                        value={trainerId}
                        onChange={(e) => setTrainerId(e.target.value)}
                        disabled={detail.trainers.length === 0}
                      >
                        <option value="">Choose a trainer</option>
                        {detail.trainers.map((t) => (
                          <option key={t.userId} value={t.userId}>
                            {t.name}
                            {t.userId === detail.trainer?.userId ? " (current)" : ""}
                          </option>
                        ))}
                      </Select>
                      {detail.trainers.length === 0 ? (
                        <p className="text-body-sm text-ink-subtle">
                          No active trainer covers this workout in this community.
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`note-${bookingId}`}>
                        Note to include <span className="font-normal text-ink-subtle">(optional)</span>
                      </Label>
                      <Input
                        id={`note-${bookingId}`}
                        value={note}
                        maxLength={160}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. Covering for a sick colleague"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        loading={busy === "reassign"}
                        disabled={!trainerId || trainerId === detail.trainer?.userId || !!busy}
                      >
                        Reassign
                      </Button>
                    </div>
                  </form>

                  <form onSubmit={cancel} className="grid gap-3 rounded-lg border border-hairline p-4">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold">
                        <CalendarClock className="size-4 text-warning" aria-hidden /> Cancel booking
                      </h3>
                      <p className="text-body-sm text-ink-muted">
                        The customer sees the reason. Package sessions are returned and simulated payments
                        refunded.
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`reason-${bookingId}`}>Reason for the customer</Label>
                      <Textarea
                        id={`reason-${bookingId}`}
                        rows={3}
                        value={reason}
                        maxLength={CANCELLATION_REASON_MAX_LENGTH}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Trainer unavailable, we're finding a replacement"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="danger"
                        size="sm"
                        loading={busy === "cancel"}
                        disabled={reason.trim().length < 3 || !!busy}
                      >
                        Cancel booking
                      </Button>
                    </div>
                  </form>
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <MapPin className="size-4 text-ink-subtle" aria-hidden /> Activity
                </h3>
                <ol className="grid gap-3 border-l border-hairline pl-4">
                  {detail.activity.map((item, i) => (
                    <li key={`${item.at}-${i}`} className="relative">
                      <span
                        aria-hidden
                        className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand"
                      />
                      <p className="text-body-sm font-semibold">{item.label}</p>
                      <p className="text-body-sm text-ink-muted">
                        {formatSlot(new Date(item.at), detail.zone.timezone)}
                      </p>
                      {item.detail ? (
                        <p className="mt-0.5 text-body-sm text-ink-subtle">{item.detail}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>

              {detail.payments.length > 0 ? (
                <div>
                  <h3 className="mb-2 font-semibold">Payments</h3>
                  <ul className="grid gap-1 text-body-sm">
                    {detail.payments.map((p, i) => (
                      <li key={`${p.createdAt}-${i}`} className="flex justify-between gap-3">
                        <span className="text-ink-muted">
                          {p.status.toLowerCase()} ·{" "}
                          {formatSlot(new Date(p.createdAt), detail.zone.timezone)}
                        </span>
                        <span className="tabular">{formatINR(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

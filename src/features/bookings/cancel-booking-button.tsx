"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CANCELLATION_POLICY_NOTE } from "@/lib/booking/cancellation";
import { CANCELLATION_REASON_MAX_LENGTH } from "@/lib/booking/rules";
import { cancelBookingAsCustomerAction, cancelBookingAsTrainerAction } from "@/server/actions/bookings";

const formSchema = (reasonRequired: boolean) =>
  z.object({
    reason: z
      .string()
      .trim()
      .max(CANCELLATION_REASON_MAX_LENGTH, `Keep it under ${CANCELLATION_REASON_MAX_LENGTH} characters`)
      .refine((v) => !reasonRequired || v.length > 0, "Add a short reason for the customer"),
  });

type FormValues = { reason: string };

/**
 * Cancel with a confirmation step. The server re-checks ownership, status and start time; this
 * component only collects intent and shows the server's answer.
 */
export function CancelBookingButton({
  bookingId,
  reference,
  whenLabel,
  as,
  size = "sm",
}: {
  bookingId: string;
  reference: string;
  whenLabel: string;
  as: "CUSTOMER" | "TRAINER";
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const reasonRequired = as === "TRAINER";
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema(reasonRequired)),
    defaultValues: { reason: "" },
  });
  const reasonId = `cancel-reason-${bookingId}`;
  const reasonError = form.formState.errors.reason?.message;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const action = as === "TRAINER" ? cancelBookingAsTrainerAction : cancelBookingAsCustomerAction;
    const res = await action({ bookingId, reason: values.reason || undefined });
    if (!res.ok) {
      const fieldMessage = res.error.fieldErrors?.reason?.[0];
      if (fieldMessage) form.setError("reason", { message: fieldMessage });
      else setServerError(res.error.message);
      return;
    }
    toast.success(`Booking ${res.data.reference} cancelled`, {
      description: "The slot is free again and the other party has been notified.",
    });
    setOpen(false);
    form.reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setServerError(null);
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size={size}>
          Cancel booking
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Cancel {reference}?</DialogTitle>
        <DialogDescription>
          {whenLabel}.{" "}
          {as === "TRAINER"
            ? "The customer will be notified with your reason."
            : "Your trainer will be notified."}
        </DialogDescription>
        <form className="mt-5 grid gap-4" onSubmit={form.handleSubmit(onSubmit)} method="post" noValidate>
          <p className="text-body-sm text-ink-muted">{CANCELLATION_POLICY_NOTE}</p>
          <div className="grid gap-1.5">
            <Label htmlFor={reasonId}>
              Reason {reasonRequired ? "" : <span className="font-normal text-ink-subtle">(optional)</span>}
            </Label>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={CANCELLATION_REASON_MAX_LENGTH}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `${reasonId}-error` : undefined}
              placeholder={reasonRequired ? "e.g. I'm unwell today" : "e.g. Travelling that week"}
              {...form.register("reason")}
            />
            {reasonError ? (
              <p id={`${reasonId}-error`} className="text-body-sm text-danger">
                {reasonError}
              </p>
            ) : null}
          </div>
          {serverError ? (
            <Notice tone="danger" live>
              {serverError}
            </Notice>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button type="submit" variant="danger" loading={form.formState.isSubmitting}>
              Cancel booking
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

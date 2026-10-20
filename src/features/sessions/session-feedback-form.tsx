"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOMER_FEEDBACK_MAX, sessionFeedbackSchema, type SessionFeedbackInput } from "@/lib/validation/sessions";
import { submitSessionFeedbackAction } from "@/server/actions/sessions";

/** Customer feedback on a completed session. The server checks ownership and completion again. */
export function SessionFeedbackForm({ bookingId, current }: { bookingId: string; current: string | null }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SessionFeedbackInput>({
    resolver: zodResolver(sessionFeedbackSchema),
    defaultValues: { bookingId, feedback: current ?? "" },
  });
  const error = form.formState.errors.feedback?.message;

  async function onSubmit(values: SessionFeedbackInput) {
    setServerError(null);
    try {
      const res = await submitSessionFeedbackAction(values);
      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      toast.success("Thanks for the feedback", { description: "Your trainer can see it on the session." });
      router.refresh();
    } catch {
      setServerError("We couldn't reach Zuryo, so nothing was saved. Try again.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} method="post" noValidate className="grid gap-2">
      <Label htmlFor={`feedback-${bookingId}`}>{current ? "Your feedback" : "How did the session go?"}</Label>
      <Textarea
        id={`feedback-${bookingId}`}
        rows={3}
        maxLength={CUSTOMER_FEEDBACK_MAX}
        aria-invalid={error ? true : undefined}
        placeholder="e.g. Loved the pace. Shoulders felt tight on rows."
        {...form.register("feedback")}
      />
      {error ? <p className="text-body-sm text-danger">{error}</p> : null}
      {serverError ? (
        <Notice tone="danger" live>
          {serverError}
        </Notice>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" className="justify-self-start" loading={form.formState.isSubmitting}>
        {current ? "Update feedback" : "Send feedback"}
      </Button>
    </form>
  );
}

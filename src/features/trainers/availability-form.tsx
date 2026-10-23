"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SLOT_INTERVAL_MINUTES } from "@/lib/booking/rules";
import { cn } from "@/lib/utils/cn";
import { minutesToClock } from "@/lib/utils/format";
import { availabilityInputSchema } from "@/lib/validation/booking";
import { addAvailabilityAction } from "@/server/actions/availability";

type FormIn = z.input<typeof availabilityInputSchema>;
type FormOut = z.output<typeof availabilityInputSchema>;

const START_OPTIONS = Array.from(
  { length: (23 * 60 - 5 * 60) / SLOT_INTERVAL_MINUTES + 1 },
  (_, i) => 5 * 60 + i * SLOT_INTERVAL_MINUTES,
);
const END_OPTIONS = START_OPTIONS.map((m) => m + SLOT_INTERVAL_MINUTES).concat(24 * 60);
const clock = (m: number) => (m === 24 * 60 ? "Midnight" : minutesToClock(m));

/** Open or block time on one day. The server checks overlaps and existing bookings under a lock. */
export function AvailabilityForm({ days }: { days: { key: string; label: string }[] }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(availabilityInputSchema),
    defaultValues: {
      date: days[0]?.key ?? "",
      startMinute: 6 * 60,
      endMinute: 12 * 60,
      status: "AVAILABLE",
      note: "",
    },
  });
  const status = form.watch("status");
  const errors = form.formState.errors;

  async function onSubmit(values: FormOut) {
    setServerError(null);
    let res: Awaited<ReturnType<typeof addAvailabilityAction>>;
    try {
      res = await addAvailabilityAction(values);
    } catch {
      setServerError("We couldn't reach ZuryoFit. Check your connection and try again.");
      return;
    }
    if (!res.ok) {
      const fe = res.error.fieldErrors ?? {};
      let shown = false;
      for (const field of ["date", "startMinute", "endMinute", "note"] as const) {
        const message = fe[field]?.[0];
        if (message) {
          form.setError(field, { message });
          shown = true;
        }
      }
      if (!shown) setServerError(res.error.message);
      return;
    }
    toast.success(values.status === "AVAILABLE" ? "Availability added" : "Time blocked", {
      description:
        values.status === "AVAILABLE"
          ? "Customers can now book this time."
          : "No new bookings will land here.",
    });
    form.reset({ ...values, note: "" });
    router.refresh();
  }

  const field = "grid gap-1.5";
  const err = (m?: string) => (m ? <p className="text-body-sm text-danger">{m}</p> : null);

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      method="post"
      noValidate
      className="grid gap-4 rounded-lg border border-hairline bg-raised p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading-md font-semibold">Add time</h2>
        <fieldset className="flex rounded-md bg-sunken p-1 text-sm font-semibold">
          <legend className="sr-only">Type</legend>
          {(["AVAILABLE", "BLOCKED"] as const).map((s) => (
            <label
              key={s}
              className={cn(
                "cursor-pointer rounded-sm px-3 py-1.5 text-ink-muted has-[:checked]:bg-raised has-[:checked]:text-ink has-[:checked]:shadow-(--shadow-1) has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
              )}
            >
              <input type="radio" value={s} className="sr-only" {...form.register("status")} />
              {s === "AVAILABLE" ? "Available" : "Blocked"}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={field}>
          <Label htmlFor="av-date">Day</Label>
          <Select id="av-date" aria-invalid={errors.date ? true : undefined} {...form.register("date")}>
            {days.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>
          {err(errors.date?.message)}
        </div>
        <div className={field}>
          <Label htmlFor="av-start">From</Label>
          <Select
            id="av-start"
            aria-invalid={errors.startMinute ? true : undefined}
            {...form.register("startMinute", { valueAsNumber: true })}
          >
            {START_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {clock(m)}
              </option>
            ))}
          </Select>
          {err(errors.startMinute?.message)}
        </div>
        <div className={field}>
          <Label htmlFor="av-end">Until</Label>
          <Select
            id="av-end"
            aria-invalid={errors.endMinute ? true : undefined}
            {...form.register("endMinute", { valueAsNumber: true })}
          >
            {END_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {clock(m)}
              </option>
            ))}
          </Select>
          {err(errors.endMinute?.message)}
        </div>
        <div className={field}>
          <Label htmlFor="av-note">
            Note <span className="font-normal text-ink-subtle">(optional)</span>
          </Label>
          <Input
            id="av-note"
            maxLength={80}
            placeholder={status === "BLOCKED" ? "e.g. Personal day" : "e.g. Pool-side sessions"}
            {...form.register("note")}
          />
          {err(errors.note?.message)}
        </div>
      </div>
      {serverError ? (
        <Notice tone="danger" live>
          {serverError}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-ink-muted">
          {status === "AVAILABLE"
            ? "Customers can book 60-minute sessions inside this time."
            : "Blocking time stops new bookings. Existing sessions must be cancelled first."}
        </p>
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          <Plus aria-hidden /> {status === "AVAILABLE" ? "Add availability" : "Block time"}
        </Button>
      </div>
    </form>
  );
}

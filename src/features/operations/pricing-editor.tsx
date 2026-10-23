"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { calculatePriceBreakdown, formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { minutesToClock } from "@/lib/utils/format";
import { pricingConfigInputSchema } from "@/lib/validation/pricing";
import { savePricingAction } from "@/server/actions/operations";

type FormIn = z.input<typeof pricingConfigInputSchema>;
type FormOut = z.output<typeof pricingConfigInputSchema>;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MINUTES = Array.from({ length: 49 }, (_, i) => i * 30);
const clock = (m: number) => (m === 1440 ? "Midnight" : minutesToClock(m));

function preview(price: string, commission: string) {
  try {
    return calculatePriceBreakdown({ sessionPrice: price || "0", commissionPercent: commission || "0" });
  } catch {
    return null;
  }
}

/**
 * Edits the standard and peak rules. Validation runs with the same Zod schema the server uses
 * (ambiguous overlapping windows, peak below standard, malformed amounts), and the server repeats it,
 * checks the user is operations, and refuses if someone else saved first.
 */
export function PricingEditor({ defaults }: { defaults: FormIn }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(pricingConfigInputSchema), defaultValues: defaults });
  const windows = useFieldArray({ control: form.control, name: "peak.windows" });
  const errors = form.formState.errors;
  const [stdPrice, stdCommission, peakPrice, peakCommission] = form.watch([
    "standard.sessionPrice",
    "standard.commissionPercent",
    "peak.sessionPrice",
    "peak.commissionPercent",
  ]);
  const std = preview(stdPrice, stdCommission);
  const peak = preview(peakPrice, peakCommission);

  async function onSubmit(values: FormOut) {
    setServerError(null);
    try {
      const res = await savePricingAction(values);
      if (!res.ok) {
        let placed = false;
        for (const issue of res.error.issues ?? []) {
          form.setError(issue.path as FieldPath<FormIn>, { message: issue.message });
          placed = true;
        }
        if (!placed || res.error.code !== "VALIDATION") setServerError(res.error.message);
        return;
      }
      toast.success("Pricing saved", {
        description: `New ${res.data.changed.map((k) => (k === "NORMAL" ? "standard" : "peak")).join(" and ")} rule is live. Existing bookings keep their price.`,
      });
      router.refresh();
    } catch {
      setServerError("We couldn't reach ZuryoFit, so nothing was saved. Try again.");
    }
  }

  const fieldError = (m?: string) => (m ? <p className="text-body-sm text-danger">{m}</p> : null);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} method="post" noValidate className="grid gap-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="grid content-start gap-4 rounded-lg border border-hairline bg-raised p-5">
          <legend className="px-1 font-semibold">Standard session</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="std-price">Session price (₹)</Label>
              <Input
                id="std-price"
                inputMode="decimal"
                aria-invalid={errors.standard?.sessionPrice ? true : undefined}
                {...form.register("standard.sessionPrice")}
              />
              {fieldError(errors.standard?.sessionPrice?.message)}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="std-commission">Society commission (%)</Label>
              <Input
                id="std-commission"
                inputMode="decimal"
                aria-invalid={errors.standard?.commissionPercent ? true : undefined}
                {...form.register("standard.commissionPercent")}
              />
              {fieldError(errors.standard?.commissionPercent?.message)}
            </div>
          </div>
          <p className="text-body-sm text-ink-muted">
            {std
              ? `Customer pays ${formatINR(std.totalAmount)} = ${formatINR(std.sessionPrice)} session + ${formatINR(std.commissionAmount)} commission. Packages also use this commission rate.`
              : "Enter a valid price and commission to see the total."}
          </p>
        </fieldset>

        <fieldset className="grid content-start gap-4 rounded-lg border border-hairline bg-raised p-5">
          <legend className="px-1 font-semibold">Peak session</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="peak-price">Session price (₹)</Label>
              <Input
                id="peak-price"
                inputMode="decimal"
                aria-invalid={errors.peak?.sessionPrice ? true : undefined}
                {...form.register("peak.sessionPrice")}
              />
              {fieldError(errors.peak?.sessionPrice?.message)}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="peak-commission">Society commission (%)</Label>
              <Input
                id="peak-commission"
                inputMode="decimal"
                aria-invalid={errors.peak?.commissionPercent ? true : undefined}
                {...form.register("peak.commissionPercent")}
              />
              {fieldError(errors.peak?.commissionPercent?.message)}
            </div>
          </div>
          <p className="text-body-sm text-ink-muted">
            {peak
              ? `Customer pays ${formatINR(peak.totalAmount)} for a session that starts inside a peak window.`
              : "Enter a valid price and commission to see the total."}
          </p>
        </fieldset>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-hairline bg-raised p-5">
        <legend className="px-1 font-semibold">Peak windows (IST, by session start time)</legend>
        {fieldError(errors.peak?.windows?.message ?? errors.peak?.windows?.root?.message)}
        <ul className="grid gap-4">
          {windows.fields.map((field, i) => {
            const we = errors.peak?.windows?.[i];
            return (
              <li key={field.id} className="grid gap-3 rounded-md bg-sunken p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`w-${i}-label`}>Label</Label>
                    <Input id={`w-${i}-label`} {...form.register(`peak.windows.${i}.label`)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`w-${i}-start`}>From</Label>
                    <Select id={`w-${i}-start`} {...form.register(`peak.windows.${i}.startMinute`, { valueAsNumber: true })}>
                      {MINUTES.slice(0, -1).map((m) => (
                        <option key={m} value={m}>
                          {clock(m)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`w-${i}-end`}>Until</Label>
                    <Select id={`w-${i}-end`} {...form.register(`peak.windows.${i}.endMinute`, { valueAsNumber: true })}>
                      {MINUTES.slice(1).map((m) => (
                        <option key={m} value={m}>
                          {clock(m)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove window ${i + 1}`}
                    disabled={windows.fields.length === 1}
                    onClick={() => windows.remove(i)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <Controller
                  control={form.control}
                  name={`peak.windows.${i}.daysOfWeek`}
                  render={({ field: f }) => (
                    <div role="group" aria-label={`Days for window ${i + 1}`} className="flex flex-wrap gap-1.5">
                      {DAYS.map((d, k) => {
                        const day = k + 1;
                        const on = f.value?.includes(day) ?? false;
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              f.onChange(
                                on
                                  ? f.value.filter((x: number) => x !== day)
                                  : [...(f.value ?? []), day].sort((a, b) => a - b),
                              )
                            }
                            className={cn(
                              "h-8 min-w-11 rounded-sm px-2 text-sm font-semibold",
                              on ? "bg-brand text-on-brand" : "bg-raised text-ink-muted hover:text-ink",
                            )}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
                {fieldError(we?.label?.message)}
                {fieldError(we?.daysOfWeek?.message ?? we?.daysOfWeek?.root?.message)}
                {fieldError(we?.startMinute?.message)}
                {fieldError(we?.endMinute?.message)}
              </li>
            );
          })}
        </ul>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={windows.fields.length >= 8}
            onClick={() => windows.append({ label: "New window", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 720, endMinute: 780 })}
          >
            <Plus aria-hidden /> Add window
          </Button>
        </div>
      </fieldset>

      {serverError ? (
        <Notice tone="danger" title="Not saved" live>
          {serverError}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-body-sm text-ink-muted">
          Saving creates a new version of each changed rule. New bookings use it immediately; existing bookings keep
          the price they were confirmed at.
        </p>
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          Save pricing
        </Button>
      </div>
    </form>
  );
}

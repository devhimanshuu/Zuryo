"use client";

import { CircleCheck, FlaskConical, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SimulatedOutcome } from "@/lib/validation/payments";

/**
 * Demo-only control: the customer picks what the simulated provider answers. There are no card,
 * UPI or bank fields anywhere, and the disclosure says so plainly.
 */
export function SimulatedOutcomePicker({
  value,
  onChange,
  name,
}: {
  value: SimulatedOutcome;
  onChange: (v: SimulatedOutcome) => void;
  name: string;
}) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-dashed border-control bg-raised p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
        <FlaskConical className="size-4 text-accent-text" aria-hidden /> Demo checkout — no real money is charged
      </legend>
      <p className="text-body-sm text-ink-muted">
        ZuryoFit doesn&apos;t collect card or bank details in this demo. Choose what the simulated payment provider
        should answer.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            { v: "SUCCEED", label: "Payment succeeds", Icon: CircleCheck, tone: "text-success" },
            { v: "DECLINE", label: "Payment is declined", Icon: TriangleAlert, tone: "text-danger" },
          ] as const
        ).map((o) => (
          <label
            key={o.v}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
              value === o.v ? "border-brand bg-brand-soft/40" : "border-hairline hover:border-control",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.v}
              checked={value === o.v}
              onChange={() => onChange(o.v)}
              className="size-4 accent-[var(--brand-600)]"
            />
            <o.Icon className={cn("size-4", o.tone)} aria-hidden />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

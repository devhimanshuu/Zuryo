"use client";

import { CreditCard, Package } from "lucide-react";
import Link from "next/link";
import { InfoTip } from "@/components/shared/info-tip";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { formatDay } from "@/lib/utils/format";
import type { BookingPayment } from "@/lib/validation/payments";
import { SimulatedOutcomePicker } from "../../payments/simulated-outcome-picker";
import { choiceCard } from "./shared";

export type WizardPackage = {
  id: string;
  name: string;
  remaining: number;
  totalSessions: number;
  expiresAt: string | null;
};

/** A package can cover the session only if it is still valid when the session starts (the server re-checks). */
export function usablePackages(packages: WizardPackage[], startAt: string) {
  return packages.filter((p) => !p.expiresAt || Date.parse(p.expiresAt) > Date.parse(startAt));
}

export function defaultPayment(packages: WizardPackage[], startAt: string): BookingPayment {
  const first = usablePackages(packages, startAt)[0];
  return first ? { method: "PACKAGE", packageId: first.id } : { method: "SIMULATED_PAYMENT", outcome: "SUCCEED" };
}

export function PaymentChoice({
  packages,
  startAt,
  total,
  value,
  onChange,
  tz,
}: {
  packages: WizardPackage[];
  startAt: string;
  total: string;
  value: BookingPayment;
  onChange: (v: BookingPayment) => void;
  tz: string;
}) {
  const usable = new Set(usablePackages(packages, startAt).map((p) => p.id));
  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-3">
        <legend className="mb-1 flex items-center gap-1.5 font-semibold">
          How would you like to pay?
          <InfoTip label="Simulated payments">
            This demo never charges a real card. You can choose a successful or declined simulated
            payment to see both paths; nothing is sent to a payment provider.
          </InfoTip>
        </legend>
        {packages.map((p) => {
          const ok = usable.has(p.id);
          return (
            <label key={p.id} className={cn(choiceCard, "items-center")}>
              <input
                type="radio"
                name="payment"
                className="sr-only"
                disabled={!ok}
                checked={value.method === "PACKAGE" && value.packageId === p.id}
                onChange={() => onChange({ method: "PACKAGE", packageId: p.id })}
                aria-describedby={`pay-pkg-${p.id}`}
              />
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden>
                <Package className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Use 1 session from {p.name}</span>
                <span id={`pay-pkg-${p.id}`} className="block text-body-sm text-ink-muted">
                  {ok
                    ? `${p.remaining} of ${p.totalSessions} left${p.expiresAt ? ` · valid until ${formatDay(new Date(p.expiresAt), tz)}` : ""}. Nothing to pay now.`
                    : `Expires ${p.expiresAt ? formatDay(new Date(p.expiresAt), tz) : ""}, before this session.`}
                </span>
              </span>
            </label>
          );
        })}
        <label className={cn(choiceCard, "items-center")}>
          <input
            type="radio"
            name="payment"
            className="sr-only"
            checked={value.method === "SIMULATED_PAYMENT"}
            onChange={() => onChange({ method: "SIMULATED_PAYMENT", outcome: "SUCCEED" })}
          />
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-ink" aria-hidden>
            <CreditCard className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Pay {formatINR(total)} now</span>
            <span className="block text-body-sm text-ink-muted">
              Simulated payment for this session only. No real card is charged.
            </span>
          </span>
        </label>
      </fieldset>
      {value.method === "SIMULATED_PAYMENT" ? (
        <SimulatedOutcomePicker
          name="booking-outcome"
          value={value.outcome}
          onChange={(outcome) => onChange({ method: "SIMULATED_PAYMENT", outcome })}
        />
      ) : null}
      {packages.length === 0 ? (
        <p className="text-body-sm text-ink-subtle">
          Book often?{" "}
          <Link href="/customer/packages" className="font-semibold text-brand hover:underline">
            Buy a package
          </Link>{" "}
          and use one session per booking.
        </p>
      ) : null}
    </div>
  );
}

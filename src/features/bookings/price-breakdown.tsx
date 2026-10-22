import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";

export type PriceLines = {
  isPeak: boolean;
  peakLabel?: string | null;
  sessionPrice: { toString(): string };
  commissionPercent: { toString(): string };
  commissionAmount: { toString(): string };
  totalAmount: { toString(): string };
  /** Present on live quotes: the standard rate and what peak adds on top. */
  standardSessionPrice?: string;
  peakUplift?: string;
};

/** Session price + society commission = total, as computed by the server. Display only. */
export function PriceBreakdown({ price, className }: { price: PriceLines; className?: string }) {
  const uplift = price.peakUplift && price.peakUplift !== "0.00" ? price.peakUplift : null;
  return (
    <dl className={cn("grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-body-md", className)}>
      <dt className="text-ink-muted">
        Session price
        <span className="block text-body-sm text-ink-subtle">
          {price.isPeak ? `Peak rate${price.peakLabel ? ` · ${price.peakLabel}` : ""}` : "Standard rate"}
        </span>
      </dt>
      <dd className="text-right font-semibold tabular">{formatINR(price.sessionPrice)}</dd>
      {uplift && price.standardSessionPrice ? (
        <dd className="col-span-2 -mt-1 rounded-sm bg-accent-soft px-2 py-1 text-body-sm text-accent-text">
          Includes {formatINR(uplift)} peak pricing on top of the {formatINR(price.standardSessionPrice)}{" "}
          standard rate
        </dd>
      ) : null}
      <dt className="text-ink-muted">Society commission ({Number(price.commissionPercent.toString())}%)</dt>
      <dd className="text-right font-semibold tabular">{formatINR(price.commissionAmount)}</dd>
      <dt className="border-t border-hairline pt-2 font-semibold">Total payable</dt>
      <dd className="border-t border-hairline pt-2 text-right text-heading-md font-semibold tabular">
        {formatINR(price.totalAmount)}
      </dd>
    </dl>
  );
}

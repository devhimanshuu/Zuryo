import {
  calculatePriceBreakdown,
  fromPaise,
  isPeakStart,
  localWeekdayAndMinute,
  toPaise,
  type PeakWindowLike,
} from "@/lib/pricing";

/**
 * Pure session pricing. The server loads the active rules from the database and calls this; the
 * browser only ever displays the result. A session is peak when its start (in the community's local
 * time) falls inside a window of the active PEAK rule; otherwise the NORMAL rule applies.
 */
type Amount = string | { toString(): string };

export type PricingRuleLike = {
  id: string;
  name: string;
  sessionPrice: Amount;
  commissionPercent: Amount;
  currency: string;
};

export type ActivePricing = {
  normal: PricingRuleLike;
  peak: (PricingRuleLike & { peakWindows: Array<PeakWindowLike & { label: string }> }) | null;
};

/** Everything the booking stores as its immutable price snapshot, plus display context. */
export type PriceQuote = {
  pricingRuleId: string;
  ruleName: string;
  isPeak: boolean;
  /** Label of the peak window that matched, e.g. "Weekday evenings". */
  peakLabel: string | null;
  sessionPrice: string;
  commissionPercent: string;
  commissionAmount: string;
  totalAmount: string;
  currency: string;
  /** The NORMAL rule's session price, so the UI can show what peak adds. */
  standardSessionPrice: string;
  /** sessionPrice − standardSessionPrice when peak applies, else "0.00". */
  peakUplift: string;
};

export function quoteSession(pricing: ActivePricing, startAt: Date, timeZone: string): PriceQuote {
  const peakRule = pricing.peak;
  const isPeak = peakRule !== null && isPeakStart(startAt, peakRule.peakWindows, timeZone);
  const rule = isPeak && peakRule ? peakRule : pricing.normal;
  const breakdown = calculatePriceBreakdown(rule);
  const standard = toPaise(pricing.normal.sessionPrice);
  const uplift = isPeak ? Math.max(0, toPaise(breakdown.sessionPrice) - standard) : 0;

  let peakLabel: string | null = null;
  if (isPeak && peakRule) {
    const { weekday, minute } = localWeekdayAndMinute(startAt, timeZone);
    peakLabel =
      peakRule.peakWindows.find(
        (w) => w.daysOfWeek.includes(weekday) && minute >= w.startMinute && minute < w.endMinute,
      )?.label ?? null;
  }

  return {
    pricingRuleId: rule.id,
    ruleName: rule.name,
    isPeak,
    peakLabel,
    ...breakdown,
    currency: rule.currency,
    standardSessionPrice: fromPaise(standard),
    peakUplift: fromPaise(uplift),
  };
}

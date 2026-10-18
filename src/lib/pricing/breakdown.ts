import { fromPaise, toBasisPoints, toPaise } from "./money";

export type PriceBreakdown = {
  sessionPrice: string;
  commissionPercent: string;
  commissionAmount: string;
  totalAmount: string;
};

/**
 * Session price + society commission, computed in integer paise with half-up rounding.
 * ₹399.00 at 10% → ₹39.90 commission → ₹438.90 total. This is the single implementation the
 * server uses; the browser only ever displays the result.
 */
export function calculatePriceBreakdown(input: {
  sessionPrice: string | { toString(): string };
  commissionPercent: string | { toString(): string };
}): PriceBreakdown {
  const pricePaise = toPaise(input.sessionPrice);
  const bps = toBasisPoints(input.commissionPercent);
  if (bps > 10000) throw new Error("Commission cannot exceed 100%");
  // pricePaise * bps / 10000, rounded half-up, without leaving integer arithmetic.
  const commissionPaise = Math.floor((pricePaise * bps + 5000) / 10000);
  return {
    sessionPrice: fromPaise(pricePaise),
    commissionPercent: fromPaise(bps),
    commissionAmount: fromPaise(commissionPaise),
    totalAmount: fromPaise(pricePaise + commissionPaise),
  };
}

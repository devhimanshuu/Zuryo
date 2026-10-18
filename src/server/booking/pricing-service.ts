import "server-only";
import { quoteSession, type ActivePricing, type PriceQuote } from "@/lib/booking/pricing";
import { AppError } from "@/lib/utils/errors";
import type { DbOrTx } from "./deps";

/**
 * Reads the active pricing configuration from the database. Exactly one active rule per kind is
 * guaranteed by a partial unique index; a rule only applies once its `effectiveFrom` has passed.
 */
export async function loadActivePricing(db: DbOrTx, now: Date): Promise<ActivePricing> {
  const rules = await db.pricingRule.findMany({
    where: { isActive: true, effectiveFrom: { lte: now } },
    include: { peakWindows: true },
  });
  const normal = rules.find((r) => r.kind === "NORMAL");
  if (!normal) {
    throw new AppError("UNAVAILABLE", "Pricing isn't configured yet, so sessions can't be booked.");
  }
  const peak = rules.find((r) => r.kind === "PEAK");
  const toRule = (r: typeof normal) => ({
    id: r.id,
    name: r.name,
    sessionPrice: r.sessionPrice.toString(),
    commissionPercent: r.commissionPercent.toString(),
    currency: r.currency,
  });
  return {
    normal: toRule(normal),
    peak:
      peak && peak.peakWindows.length > 0
        ? {
            ...toRule(peak),
            peakWindows: peak.peakWindows.map((w) => ({
              label: w.label,
              daysOfWeek: w.daysOfWeek,
              startMinute: w.startMinute,
              endMinute: w.endMinute,
            })),
          }
        : null,
  };
}

/** The authoritative price for a session starting at `startAt` in the community's timezone. */
export async function quoteFor(db: DbOrTx, now: Date, startAt: Date, timeZone: string): Promise<PriceQuote> {
  return quoteSession(await loadActivePricing(db, now), startAt, timeZone);
}

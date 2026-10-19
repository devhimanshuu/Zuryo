import { calculatePriceBreakdown, fromPaise, toPaise } from "@/lib/pricing";

/**
 * Pure package rules. Packages are bought at the plan price plus the society commission from the
 * active standard pricing rule, the same way a single session is priced. One package session covers
 * any one 60-minute session (standard or peak) in the customer's community.
 */
type Amount = string | { toString(): string };

export type PackageQuote = {
  basePrice: string;
  commissionPercent: string;
  commissionAmount: string;
  totalAmount: string;
  /** basePrice / sessions, rounded to the paisa (display only; nothing is charged per session). */
  perSessionBase: string;
  /** sessions × the current standard session price: the clearly defined comparison for savings. */
  comparisonBase: string;
  /** comparisonBase − basePrice when positive, else null (no savings claim is made). */
  savings: string | null;
};

export function quotePackage(
  plan: { price: Amount; sessionCount: number },
  standard: { sessionPrice: Amount; commissionPercent: Amount },
): PackageQuote {
  const b = calculatePriceBreakdown({ sessionPrice: plan.price, commissionPercent: standard.commissionPercent });
  const base = toPaise(b.sessionPrice);
  const comparison = toPaise(standard.sessionPrice) * plan.sessionCount;
  return {
    basePrice: b.sessionPrice,
    commissionPercent: b.commissionPercent,
    commissionAmount: b.commissionAmount,
    totalAmount: b.totalAmount,
    perSessionBase: fromPaise(Math.round(base / plan.sessionCount)),
    comparisonBase: fromPaise(comparison),
    savings: comparison > base ? fromPaise(comparison - base) : null,
  };
}

export type PackageStatusValue = "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "CANCELLED" | "PENDING_PAYMENT";

export type PackageLike = {
  customerId: string;
  status: PackageStatusValue;
  totalSessions: number;
  usedSessions: number;
  expiresAt: Date | null;
};

export function remainingSessions(p: { totalSessions: number; usedSessions: number }): number {
  return Math.max(0, p.totalSessions - p.usedSessions);
}

/** Status as customers should see it right now: an active package past its expiry is expired. */
export function effectiveStatus(p: PackageLike, now: Date): PackageStatusValue {
  if ((p.status === "ACTIVE" || p.status === "EXHAUSTED") && p.expiresAt && p.expiresAt <= now) {
    return "EXPIRED";
  }
  return p.status;
}

export function expiryFrom(paidAt: Date, validityDays: number): Date {
  return new Date(paidAt.getTime() + validityDays * 86_400_000);
}

export type RedemptionBlocker =
  | "NOT_OWNER"
  | "NOT_PAID"
  | "CANCELLED"
  | "EXPIRED"
  | "EXHAUSTED"
  | "EXPIRES_BEFORE_SESSION";

export const REDEMPTION_MESSAGE: Record<RedemptionBlocker, string> = {
  NOT_OWNER: "We couldn't find that package on your account.",
  NOT_PAID: "This package hasn't been paid for yet.",
  CANCELLED: "This package checkout was discarded.",
  EXPIRED: "This package has expired.",
  EXHAUSTED: "There are no sessions left in this package.",
  EXPIRES_BEFORE_SESSION: "This package expires before the session starts.",
};

/** Why this package can't cover a session for `customerId` starting at `startAt`, or null if it can. */
export function redemptionBlocker(
  p: PackageLike,
  c: { customerId: string; startAt: Date; now: Date },
): RedemptionBlocker | null {
  if (p.customerId !== c.customerId) return "NOT_OWNER";
  if (p.status === "PENDING_PAYMENT") return "NOT_PAID";
  if (p.status === "CANCELLED") return "CANCELLED";
  if (effectiveStatus(p, c.now) === "EXPIRED") return "EXPIRED";
  if (p.status === "EXHAUSTED" || remainingSessions(p) <= 0) return "EXHAUSTED";
  if (p.expiresAt && c.startAt >= p.expiresAt) return "EXPIRES_BEFORE_SESSION";
  return null;
}

/**
 * Cancellation policy for package sessions. The requirements define no cancellation cutoff or fee,
 * and a booking can only be cancelled before it starts, so every allowed cancellation restores the
 * session. Kept as a function so a future cutoff changes one place.
 */
export function cancellationRestoresSession(): boolean {
  return true;
}

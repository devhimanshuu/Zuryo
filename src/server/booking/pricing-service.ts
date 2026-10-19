import "server-only";
import { z } from "zod";
import { quoteSession, type ActivePricing, type PriceQuote } from "@/lib/booking/pricing";
import { fromPaise, toPaise } from "@/lib/pricing";
import { AppError } from "@/lib/utils/errors";
import { pricingConfigInputSchema, type PricingConfigInput } from "@/lib/validation/pricing";
import type { Actor } from "@/server/auth/actor";
import type { BookingDeps, DbOrTx } from "./deps";
import { fail, ok, type ServiceResult } from "./errors";

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

// ─── Pricing management (operations) ─────────────────────────────────────

export type PricingRuleView = {
  id: string;
  kind: "NORMAL" | "PEAK";
  name: string;
  sessionPrice: string;
  commissionPercent: string;
  isActive: boolean;
  effectiveFrom: Date;
  createdBy: string | null;
  bookingCount: number;
  windows: Array<{ label: string; daysOfWeek: number[]; startMinute: number; endMinute: number }>;
};

/** Active rules plus recent versions, so operations can see what each historical booking was priced by. */
export async function getPricingAdminView(db: DbOrTx): Promise<{
  standard: PricingRuleView | null;
  peak: PricingRuleView | null;
  history: PricingRuleView[];
}> {
  const rules = await db.pricingRule.findMany({
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    take: 20,
    include: {
      peakWindows: { orderBy: [{ startMinute: "asc" }] },
      createdBy: { select: { name: true } },
      _count: { select: { bookings: true } },
    },
  });
  const view = rules.map(
    (r): PricingRuleView => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      sessionPrice: r.sessionPrice.toString(),
      commissionPercent: r.commissionPercent.toString(),
      isActive: r.isActive,
      effectiveFrom: r.effectiveFrom,
      createdBy: r.createdBy?.name ?? null,
      bookingCount: r._count.bookings,
      windows: r.peakWindows.map((w) => ({
        label: w.label,
        daysOfWeek: [...w.daysOfWeek].sort((a, b) => a - b),
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
    }),
  );
  return {
    standard: view.find((r) => r.isActive && r.kind === "NORMAL") ?? null,
    peak: view.find((r) => r.isActive && r.kind === "PEAK") ?? null,
    history: view,
  };
}

const money = (v: string) => fromPaise(toPaise(v));
const sameWindows = (a: PricingRuleView["windows"], b: PricingConfigInput["peak"]["windows"]) =>
  a.length === b.length &&
  a.every((w, i) => {
    const o = [...b].sort((x, y) => x.startMinute - y.startMinute || x.label.localeCompare(y.label))[i];
    return (
      !!o &&
      o.label === w.label &&
      o.startMinute === w.startMinute &&
      o.endMinute === w.endMinute &&
      [...o.daysOfWeek].sort((x, y) => x - y).join() === w.daysOfWeek.join()
    );
  });

/**
 * Save new pricing. Rules are versioned, never edited: a changed rule is deactivated and replaced by a
 * new row, so every existing booking keeps pointing at the rule (and the snapshot) that priced it.
 * Only operations users may save. The active rules are locked while saving, and `basedOn` must name
 * the rules the editor was showing, so two people saving at once can't overwrite each other blindly.
 */
export async function updatePricing(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ changed: Array<"NORMAL" | "PEAK"> }>> {
  if (actor.role !== "OPERATIONS") return fail("FORBIDDEN", "Only operations can change pricing.");
  const parsed = pricingConfigInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Some pricing values need another look.", {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    });
  }
  const input = parsed.data;
  const now = deps.now();

  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PricingRule" WHERE "isActive" FOR UPDATE`;
    const current = await getPricingAdminView(tx);
    if (
      current.standard?.id !== input.basedOn.standardRuleId ||
      (current.peak?.id ?? null) !== input.basedOn.peakRuleId
    ) {
      return fail<{ changed: Array<"NORMAL" | "PEAK"> }>(
        "CONFLICT",
        "Pricing was changed by someone else while you were editing. Reload to see the latest rules.",
      );
    }

    const standardChanged =
      !current.standard ||
      money(current.standard.sessionPrice) !== money(input.standard.sessionPrice) ||
      money(current.standard.commissionPercent) !== money(input.standard.commissionPercent);
    const peakChanged =
      !current.peak ||
      money(current.peak.sessionPrice) !== money(input.peak.sessionPrice) ||
      money(current.peak.commissionPercent) !== money(input.peak.commissionPercent) ||
      !sameWindows(current.peak.windows, input.peak.windows);
    if (!standardChanged && !peakChanged) {
      return fail<{ changed: Array<"NORMAL" | "PEAK"> }>("VALIDATION", "Nothing changed, so nothing was saved.");
    }

    const changed: Array<"NORMAL" | "PEAK"> = [];
    if (standardChanged) {
      if (current.standard) {
        await tx.pricingRule.update({ where: { id: current.standard.id }, data: { isActive: false } });
      }
      await tx.pricingRule.create({
        data: {
          name: "Standard session",
          kind: "NORMAL",
          sessionPrice: money(input.standard.sessionPrice),
          commissionPercent: money(input.standard.commissionPercent),
          effectiveFrom: now,
          createdById: actor.userId,
        },
      });
      changed.push("NORMAL");
    }
    if (peakChanged) {
      if (current.peak) {
        await tx.pricingRule.update({ where: { id: current.peak.id }, data: { isActive: false } });
      }
      await tx.pricingRule.create({
        data: {
          name: "Peak session",
          kind: "PEAK",
          sessionPrice: money(input.peak.sessionPrice),
          commissionPercent: money(input.peak.commissionPercent),
          effectiveFrom: now,
          createdById: actor.userId,
          peakWindows: {
            create: input.peak.windows.map((w) => ({
              label: w.label,
              daysOfWeek: [...w.daysOfWeek].sort((a, b) => a - b),
              startMinute: w.startMinute,
              endMinute: w.endMinute,
            })),
          },
        },
      });
      changed.push("PEAK");
    }
    return ok({ changed });
  }, deps.tx);
}

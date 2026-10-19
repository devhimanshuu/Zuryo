import { z } from "zod";
import { findWindowOverlaps } from "@/lib/pricing/peak";
import { pricingKindSchema } from "./enums";

/** "399", "399.0", "399.00" — at most two decimals, no sign, no exponent. */
export const inrAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, "Enter an amount like 399 or 399.00")
  .refine((v) => Number(v) > 0, "Amount must be more than ₹0")
  .refine((v) => Number(v) <= 100000, "Amount must be at most ₹1,00,000");

export const percentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage like 10 or 12.5")
  .refine((v) => Number(v) <= 100, "Percentage cannot exceed 100");

const minuteOfDay = z.number().int().min(0).max(1440);

export const peakWindowSchema = z
  .object({
    label: z.string().trim().min(1, "Give this window a name").max(40),
    daysOfWeek: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Pick at least one day")
      .refine((d) => new Set(d).size === d.length, "Days must not repeat"),
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
  })
  .refine((w) => w.endMinute > w.startMinute, {
    message: "End time must be after start time",
    path: ["endMinute"],
  });

export const pricingRuleInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    kind: pricingKindSchema,
    sessionPrice: inrAmountSchema,
    commissionPercent: percentSchema,
    peakWindows: z.array(peakWindowSchema).max(8).default([]),
  })
  .refine((r) => r.kind === "PEAK" || r.peakWindows.length === 0, {
    message: "Only peak rules have peak windows",
    path: ["peakWindows"],
  })
  .refine((r) => r.kind === "NORMAL" || r.peakWindows.length > 0, {
    message: "A peak rule needs at least one peak window",
    path: ["peakWindows"],
  });

export type PricingRuleInput = z.infer<typeof pricingRuleInputSchema>;

const ruleId = z.string().trim().min(1).max(40);

/**
 * What operations submit from the pricing editor: the standard rule, the peak rule with its windows,
 * and the ids of the rules they were editing. The ids make saving optimistic: if someone else saved
 * in the meantime the server refuses instead of silently overwriting their change.
 */
export const pricingConfigInputSchema = z
  .object({
    standard: z.object({ sessionPrice: inrAmountSchema, commissionPercent: percentSchema }).strict(),
    peak: z
      .object({
        sessionPrice: inrAmountSchema,
        commissionPercent: percentSchema,
        windows: z
          .array(peakWindowSchema)
          .min(1, "Add at least one peak window")
          .max(8, "Use at most 8 peak windows"),
      })
      .strict(),
    basedOn: z.object({ standardRuleId: ruleId, peakRuleId: ruleId.nullable() }).strict(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (Number(cfg.peak.sessionPrice) < Number(cfg.standard.sessionPrice)) {
      ctx.addIssue({
        code: "custom",
        path: ["peak", "sessionPrice"],
        message: "The peak price can't be lower than the standard price",
      });
    }
    for (const [a, b] of findWindowOverlaps(cfg.peak.windows)) {
      ctx.addIssue({
        code: "custom",
        path: ["peak", "windows", b, "startMinute"],
        message: `Overlaps "${cfg.peak.windows[a]?.label}" on the same day, so the rule would be ambiguous`,
      });
    }
  });

export type PricingConfigInput = z.infer<typeof pricingConfigInputSchema>;

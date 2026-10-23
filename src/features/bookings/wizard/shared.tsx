"use client";

import {
  CalendarClock,
  Dumbbell,
  Flower2,
  HeartPulse,
  PersonStanding,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { WorkoutCategory } from "@/lib/validation/enums";
import type { ServiceError, ServiceResult } from "@/server/booking/errors";

export const CATEGORY_ICON: Record<WorkoutCategory, LucideIcon> = {
  STRENGTH: Dumbbell,
  YOGA: Flower2,
  CARDIO: HeartPulse,
  FUNCTIONAL: PersonStanding,
  MOBILITY: Waves,
};

export const MODE_ICON = { INSTANT: Zap, SCHEDULED: CalendarClock } as const;

export type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: ServiceError };

const OFFLINE: ServiceError = {
  code: "UNAVAILABLE",
  message: "We couldn't reach ZuryoFit. Check your connection and try again.",
};

/** Calls a server action and turns a network failure into a structured error instead of a throw. */
export async function call<I, T>(
  action: (input: I) => Promise<ServiceResult<T>>,
  input: I,
): Promise<ServiceResult<T>> {
  try {
    return await action(input);
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

/** Radio-card styling shared by the wizard's choices. The native radio keeps keyboard and SR support. */
export const choiceCard =
  "relative flex cursor-pointer gap-3 rounded-lg border border-hairline bg-raised p-4 transition-[border-color,box-shadow] duration-150 hover:border-control has-[:checked]:border-brand has-[:checked]:shadow-[0_0_0_1px_var(--brand-600)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55 has-[:disabled]:hover:border-hairline";

export function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

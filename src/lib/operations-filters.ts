import { parseChoice } from "@/lib/pagination";
import type { BookingStatus } from "@/lib/validation/enums";

/** URL filter parsing for the operations workspaces. Invalid values degrade to "no filter". */

export const Q_MAX_LENGTH = 60;

export function normalizeQuery(raw: string | string[] | undefined): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? "").trim().slice(0, Q_MAX_LENGTH);
}

export const BOOKING_STATUS_FILTERS = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const satisfies readonly BookingStatus[];

export function parseBookingStatus(raw: unknown): BookingStatus | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return null;
  const value = first.trim().toUpperCase();
  return (BOOKING_STATUS_FILTERS as readonly string[]).includes(value) ? (value as BookingStatus) : null;
}

export const BOOKING_SORTS = ["newest", "oldest", "updated"] as const;
export type BookingSort = (typeof BOOKING_SORTS)[number];

export function parseBookingSort(raw: unknown): BookingSort {
  return parseChoice(raw as string | string[] | undefined, BOOKING_SORTS, "newest");
}

export const TRAINER_STATUS_FILTERS = ["all", "active", "inactive"] as const;

export function parseTrainerActive(raw: unknown): boolean | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return null;
  const value = first.trim().toLowerCase();
  if (value === "active") return true;
  if (value === "inactive") return false;
  return null;
}

export const TRAINER_SORTS = ["name", "experience"] as const;
export type TrainerSort = (typeof TRAINER_SORTS)[number];

export function parseTrainerSort(raw: unknown): TrainerSort {
  return parseChoice(raw as string | string[] | undefined, TRAINER_SORTS, "name");
}

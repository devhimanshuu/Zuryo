import "server-only";
import type { PriceQuote } from "@/lib/booking/pricing";

/**
 * Structured, user-presentable outcomes for booking operations. Services return these instead of
 * throwing for expected business failures; anything unexpected is thrown, logged by the caller and
 * replaced with a generic message, so database internals never reach the browser.
 */
export type ServiceErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "SLOT_TAKEN"
  | "NO_TRAINER"
  | "PRICE_CHANGED"
  | "PAYMENT_FAILED"
  | "PACKAGE_UNAVAILABLE"
  | "UNAVAILABLE"
  | "INTERNAL";

/** A nearby slot the UI can offer when the requested one can't be booked. */
export type SlotSuggestion = { startAt: string; trainerCount: number; isPeak: boolean; totalAmount: string };

export type ServiceError = {
  code: ServiceErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  /** Validation issues with their full dotted path (e.g. "peak.windows.1.startMinute"). */
  issues?: Array<{ path: string; message: string }>;
  alternatives?: SlotSuggestion[];
  quote?: PriceQuote;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

export const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

export function fail<T = never>(
  code: ServiceErrorCode,
  message: string,
  extra: Omit<ServiceError, "code" | "message"> = {},
): ServiceResult<T> {
  return { ok: false, error: { code, message, ...extra } };
}

export const INTERNAL_ERROR: ServiceError = {
  code: "INTERNAL",
  message: "Something went wrong on our side and nothing was booked or changed. Please try again.",
};

// ─── Postgres error classification ──────────────────────────────────────────
// With @prisma/adapter-pg, constraint failures surface in two shapes:
//   unique violations  → PrismaClientKnownRequestError P2002, details in meta.driverAdapterError
//   exclusion (23P01)  → DriverAdapterError with cause.code "23P01" and the constraint in the message

type Loose = { code?: unknown; message?: unknown; meta?: unknown; cause?: unknown };

function asLoose(err: unknown): Loose {
  return typeof err === "object" && err !== null ? (err as Loose) : {};
}

function adapterCause(err: unknown): Loose {
  const e = asLoose(err);
  const meta = asLoose(e.meta) as { driverAdapterError?: { cause?: unknown } };
  return asLoose(meta.driverAdapterError?.cause ?? e.cause);
}

/** The Postgres SQLSTATE behind an error, if there is one. */
export function postgresCode(err: unknown): string | undefined {
  const cause = adapterCause(err) as Loose & { originalCode?: unknown };
  for (const c of [cause.originalCode, cause.code]) if (typeof c === "string") return c;
  const msg = String(asLoose(err).message ?? "");
  if (/exclusion constraint/i.test(msg)) return "23P01";
  return undefined;
}

function errorText(err: unknown): string {
  const cause = adapterCause(err) as Loose & { originalMessage?: unknown };
  return `${String(asLoose(err).message ?? "")} ${String(cause.originalMessage ?? cause.message ?? "")}`;
}

/** Name of the constraint an exclusion violation hit, e.g. "Booking_trainer_no_overlap". */
export function exclusionConstraint(err: unknown): string | null {
  if (postgresCode(err) !== "23P01") return null;
  return /exclusion constraint "([^"]+)"/.exec(errorText(err))?.[1] ?? "unknown";
}

/** True for a unique violation on the given column (Prisma reports fields quoted or bare). */
export function isUniqueViolationOn(err: unknown, field: string): boolean {
  const e = asLoose(err);
  if (e.code !== "P2002" && postgresCode(err) !== "23505") return false;
  const cause = adapterCause(err) as { constraint?: { fields?: unknown } };
  const fields = Array.isArray(cause.constraint?.fields) ? (cause.constraint.fields as unknown[]) : [];
  if (fields.some((f) => String(f).replaceAll('"', "") === field)) return true;
  return errorText(err).includes(`_${field}_key`);
}

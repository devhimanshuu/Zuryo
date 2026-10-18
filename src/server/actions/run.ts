import "server-only";
import { AppError } from "@/lib/utils/errors";
import { INTERNAL_ERROR, type ServiceErrorCode, type ServiceResult } from "@/server/booking/errors";

const APP_ERROR_CODES: Record<AppError["code"], ServiceErrorCode> = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  CONFLICT: "CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  UNAVAILABLE: "UNAVAILABLE",
};

/**
 * Runs a server action body and guarantees a structured result. Expected failures come back from
 * the services as `{ ok: false }`; anything thrown (database down, bug) is logged server-side and
 * replaced with a generic message, so stack traces and SQL never reach the browser and a failed
 * write can never be reported as a success.
 */
export async function runAction<T>(
  label: string,
  body: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, error: { code: APP_ERROR_CODES[err.code], message: err.message } };
    }
    console.error(`[action:${label}]`, err);
    return { ok: false, error: INTERNAL_ERROR };
  }
}

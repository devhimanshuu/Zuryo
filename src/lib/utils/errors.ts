/** Errors the UI may show verbatim. Anything else is logged and replaced with a generic message. */
export class AppError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/**
 * Run a server-side loader and turn failures into a typed result, so pages can render an
 * explicit error state (e.g. "database not configured") instead of crashing.
 */
export async function safely<T>(load: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message } };
    const message = err instanceof Error ? err.message : String(err);
    if (
      /DATABASE_URL|ECONNREFUSED|Can't reach database|connect|ENOTFOUND|password authentication/i.test(
        message,
      )
    ) {
      console.error("[db]", message);
      return {
        ok: false,
        error: { code: "UNAVAILABLE", message: "The database isn't reachable. Check DATABASE_URL in .env." },
      };
    }
    console.error(err);
    return { ok: false, error: { code: "INTERNAL", message: "Something went wrong loading this page." } };
  }
}

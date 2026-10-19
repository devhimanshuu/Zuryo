import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env.server";
import { defaultDeps } from "@/server/booking/deps";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export const dynamic = "force-dynamic";

/**
 * Scheduled lifecycle processing: sends due 55-minute warnings and closes sessions at their 60-minute
 * deadline, for every in-progress session. Idempotent, so running it every minute (or twice at once)
 * is safe. Call it from Vercel Cron (Pro: every minute) or any external scheduler with
 * `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET the endpoint is disabled.
 */
export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Session lifecycle cron is not configured (set CRON_SECRET)." }, { status: 503 });
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const counts = await reconcileDueSessions(defaultDeps(), {}, 500);
    return NextResponse.json({ ok: true, ...counts, ranAt: new Date().toISOString() });
  } catch (err) {
    console.error("[cron:session-lifecycle]", err);
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { defaultDeps } from "@/server/booking/deps";
import { getLiveSnapshot } from "@/server/live/live-service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Polled by open workspace pages (see <LiveRefresh>). A GET route rather than a server action, so a
 * background poll never queues in front of the user's own actions. Identity comes from the session
 * cookie only; the snapshot is scoped to that user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers: NO_STORE });
  }
  try {
    const snapshot = await getLiveSnapshot(defaultDeps(), {
      userId: session.user.id,
      role: session.user.role,
      name: session.user.name ?? "Zuryo user",
    });
    return NextResponse.json(snapshot, { headers: NO_STORE });
  } catch (err) {
    console.error("[live]", err);
    return NextResponse.json({ error: "Couldn't check for updates." }, { status: 503, headers: NO_STORE });
  }
}

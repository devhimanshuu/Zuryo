import { MessageCircle, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardIcon, CardTitle } from "@/components/ui/card";
import { CoachChat } from "@/features/coach/coach-chat";
import { COACH_SCOPE_SUMMARY } from "@/lib/coach/scope";
import { getDb } from "@/lib/db";
import { safely } from "@/lib/utils/errors";
import { getActor } from "@/server/auth/actor";
import { getCoachThread } from "@/server/coach/coach-service";

export const metadata: Metadata = { title: "Coach" };

export default async function CoachPage() {
  const actor = await getActor("CUSTOMER");
  const result = await safely(() => getCoachThread(getDb(), actor.userId));
  if (!result.ok) return <ErrorState message={result.error.message} />;

  const firstName = actor.name.trim().split(/\s+/)[0] || actor.name;

  return (
    <div>
      <PageHeader
        editorial
        title="Coach"
        description={`Hi ${firstName} — ask your fitness coach about training, recovery or your own Zuryo sessions. Answers use your profile and recent sessions, never anyone else's.`}
        className="pb-0"
      />

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <CoachChat initialMessages={result.data} />
          </CardContent>
        </Card>

        <aside className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>What it helps with</CardTitle>
              <CardIcon icon={MessageCircle} />
            </CardHeader>
            <CardContent className="grid gap-3 text-body-sm text-ink-muted">
              <p>{COACH_SCOPE_SUMMARY}</p>
              <p>
                It knows your saved level, goals, equipment, next session and package, and says when something
                isn&apos;t in your records instead of guessing.
              </p>
              <p>
                It can&apos;t book, cancel, reschedule or take payment. Use{" "}
                <span className="font-semibold text-ink">Book a session</span> and{" "}
                <span className="font-semibold text-ink">My bookings</span> for those.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Safety first</CardTitle>
              <CardIcon icon={ShieldCheck} />
            </CardHeader>
            <CardContent className="grid gap-2 text-body-sm text-ink-muted">
              <p>
                The coach doesn&apos;t diagnose, treat or prescribe. For pain, injury, illness, pregnancy or a medical
                condition, check with a doctor or physiotherapist.
              </p>
              <p className="rounded-md bg-warning-soft px-3 py-2 text-warning">
                Chest pain, trouble breathing, fainting or another emergency: stop exercising and call 112 (India).
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

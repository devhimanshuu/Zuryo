import { ArrowRight, CalendarDays, CircleCheck, Clock, ShieldCheck, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { calculatePriceBreakdown, formatINR } from "@/lib/pricing";
import { safely } from "@/lib/utils/errors";
import { formatDays, minutesToClock } from "@/lib/utils/format";
import { getActivePricing } from "@/server/queries/operations";

export const metadata: Metadata = { title: "How it works" };
export const dynamic = "force-dynamic";

const JOURNEY = [
  {
    icon: CircleCheck,
    title: "Tell us about your fitness",
    body: "A short assessment covers your goals, experience and preferences. No medical history.",
  },
  {
    icon: Zap,
    title: "Choose instant or scheduled",
    body: "Instant looks for a trainer who can start within 60 minutes; scheduled lets you pick a slot.",
  },
  {
    icon: CalendarDays,
    title: "Pick a time and a trainer",
    body: "Available 60-minute slots are listed with their price. Choose a preferred trainer, or let Zuryo assign one.",
  },
  {
    icon: ShieldCheck,
    title: "Review and pay",
    body: "The server calculates the session price plus society commission. Checkout in this demo is simulated.",
  },
  {
    icon: Clock,
    title: "Train, then track progress",
    body: "Your trainer starts the session, logs the workout and suggests what to do next.",
  },
];

export default async function HowItWorksPage() {
  const pricing = await safely(getActivePricing);

  return (
    <div className="container-page py-12 lg:py-20">
      <header className="max-w-2xl">
        <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">How it works</p>
        <h1 className="mt-2 font-display text-[2.5rem] leading-[1.05] sm:text-display-lg">
          From &ldquo;I should work out&rdquo; to a trainer at your door
        </h1>
        <p className="mt-4 text-body-lg text-ink-muted">
          Every Zuryo session is 60 minutes with a trainer who serves your residential community.
        </p>
      </header>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-5">
        {JOURNEY.map((s, i) => (
          <li key={s.title} className="bg-raised p-5">
            <s.icon className="size-5 text-brand" aria-hidden />
            <p className="mt-4 text-eyebrow font-semibold tracking-[0.08em] text-ink-subtle uppercase tabular">
              0{i + 1}
            </p>
            <h2 className="mt-1 text-heading-md font-semibold">{s.title}</h2>
            <p className="mt-1.5 text-body-sm text-ink-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="pricing-heading" className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 id="pricing-heading" className="font-display text-display-md">
            Pricing you can see before you pay
          </h2>
          <p className="mt-3 text-ink-muted">
            Sessions are priced as normal or peak depending on when they start. A society commission is added
            at checkout and shown as its own line. The server always calculates the final amount; the app
            never trusts a total sent from the browser.
          </p>
          <p className="mt-3 text-body-sm text-ink-subtle">
            Prices below are this demo&apos;s current configuration.
          </p>
        </div>

        {pricing.ok && pricing.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {pricing.data.map((rule) => {
              const b = calculatePriceBreakdown(rule);
              return (
                <article key={rule.id} className="rounded-lg border border-hairline bg-raised p-5">
                  <p className="text-body-sm font-semibold text-ink-muted">
                    {rule.kind === "PEAK" ? "Peak slot" : "Normal slot"}
                  </p>
                  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-2 text-body-md">
                    <dt className="text-ink-muted">Session (60 min)</dt>
                    <dd className="text-right font-semibold tabular">{formatINR(b.sessionPrice)}</dd>
                    <dt className="text-ink-muted">Commission ({Number(b.commissionPercent)}%)</dt>
                    <dd className="text-right font-semibold tabular">{formatINR(b.commissionAmount)}</dd>
                  </dl>
                  <div className="mt-3 flex items-baseline justify-between border-t border-hairline pt-3">
                    <span className="font-semibold">Total</span>
                    <span className="text-numeric-lg font-semibold tracking-tight tabular">
                      {formatINR(b.totalAmount)}
                    </span>
                  </div>
                  {rule.peakWindows.length > 0 ? (
                    <ul className="mt-4 grid gap-1 text-body-sm text-ink-muted">
                      {rule.peakWindows.map((w) => (
                        <li key={w.id}>
                          {w.label}: {formatDays(w.daysOfWeek)}, {minutesToClock(w.startMinute)}–
                          {minutesToClock(w.endMinute)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-body-sm text-ink-muted">Any time outside peak windows.</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-control bg-raised p-6 text-ink-muted">
            Current prices appear here once the database is connected and seeded.
          </div>
        )}
      </section>

      <div className="mt-16 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-hairline bg-raised p-6">
        <p className="text-heading-md font-semibold">Ready to try it?</p>
        <Button asChild variant="primary">
          <Link href="/sign-in">
            Sign in to open the customer workspace <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}

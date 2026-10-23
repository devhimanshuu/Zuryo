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
    body: "Available 60-minute slots are listed with their price. Choose a preferred trainer, or let ZuryoFit assign one.",
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
    <div className="relative isolate">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden"
      >
        <div className="absolute -top-56 left-[8%] h-[480px] w-[680px] rounded-full bg-brand-soft/80 blur-3xl" />
        <div className="absolute inset-0 bg-dot-grid fade-radial text-ink/[0.06]" />
      </div>
      <div className="container-page py-12 lg:py-20">
        <header className="max-w-2xl animate-rise">
          <p className="flex items-center gap-3 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
            <span className="h-px w-6 bg-brand" aria-hidden />
            How it works
          </p>
          <h1 className="mt-3 font-display text-[2.5rem] leading-[1.05] sm:text-display-lg">
            From &ldquo;I should work out&rdquo; to a trainer at your door
          </h1>
          <p className="mt-4 text-body-lg text-ink-muted">
            Every ZuryoFit session is 60 minutes with a trainer who serves your residential community.
          </p>
        </header>

        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline shadow-(--shadow-2) md:grid-cols-5">
          {JOURNEY.map((s, i) => (
            <li key={s.title} className="group bg-raised p-5 transition-colors hover:bg-surface lg:p-6">
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center rounded-md bg-brand-soft text-brand">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span
                  className="font-display text-display-md leading-none text-ink/10 tabular transition-colors group-hover:text-brand/30"
                  aria-hidden
                >
                  0{i + 1}
                </span>
              </div>
              <h2 className="mt-5 text-heading-md font-semibold">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h2>
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
              Sessions are priced as normal or peak depending on when they start. A society commission is
              added at checkout and shown as its own line. The server always calculates the final amount; the
              app never trusts a total sent from the browser.
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
                  <article
                    key={rule.id}
                    className="rounded-lg border border-hairline bg-raised p-5 shadow-(--shadow-1) lg:p-6"
                  >
                    <p
                      className={
                        rule.kind === "PEAK"
                          ? "inline-flex items-center gap-1.5 rounded-sm bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-text"
                          : "inline-flex items-center gap-1.5 rounded-sm bg-brand-soft px-2 py-1 text-xs font-semibold text-brand"
                      }
                    >
                      {rule.kind === "PEAK" ? (
                        <Zap className="size-3.5" aria-hidden />
                      ) : (
                        <Clock className="size-3.5" aria-hidden />
                      )}
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
            <div className="rounded-lg border border-dashed border-control/50 bg-raised p-6 text-ink-muted">
              Current prices appear here once the database is connected and seeded.
            </div>
          )}
        </section>

        <div className="relative isolate mt-16 flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-lg bg-brand px-6 py-8 text-on-brand shadow-(--shadow-3) sm:px-8 lg:px-10">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-dot-grid fade-radial text-on-brand/[0.08]" />
            <div className="absolute -top-24 -left-10 size-72 rounded-full bg-accent/25 blur-3xl" />
          </div>
          <div>
            <p className="font-display text-display-md">Ready to try it?</p>
            <p className="mt-1 text-on-brand/80">Sign in with a demo account and book your first session.</p>
          </div>
          <Button asChild variant="inverse" size="lg" className="group">
            <Link href="/sign-in">
              Sign in to book{" "}
              <ArrowRight
                className="transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

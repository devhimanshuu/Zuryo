import { ArrowLeft, CalendarCheck, Check } from "lucide-react";
import Link from "next/link";
import { FitnessImage } from "@/components/shared/fitness-image";
import { Wordmark } from "@/components/shared/wordmark";
import { IMAGES } from "@/lib/config/images";

/** Split screen on desktop: the form on the left, a calm brand panel on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative isolate flex min-h-dvh flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-48 -left-32 h-[420px] w-[560px] rounded-full bg-brand-soft/70 blur-3xl" />
          <div className="absolute inset-0 bg-dot-grid fade-radial text-ink/[0.05]" />
        </div>
        <header className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
          <Wordmark />
          <Link
            href="/"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            Back to site
          </Link>
        </header>
        {/* Bottom padding keeps the floating "Demo accounts" launcher clear of the form. */}
        <main id="main" className="grid flex-1 place-items-center px-4 pt-4 pb-24 sm:px-8 sm:pb-20">
          {children}
        </main>
      </div>

      <aside aria-label="About ZuryoFit" className="sticky top-0 hidden h-dvh p-3 lg:block">
        <div className="relative isolate flex h-full flex-col justify-between overflow-hidden rounded-lg bg-inverse p-10 text-ink-inverse xl:p-12">
          <FitnessImage image={IMAGES.trainer} sizes="50vw" className="absolute inset-0 -z-20" />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-linear-to-t from-inverse via-inverse/75 to-inverse/25"
          />

          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-ink-inverse/20 bg-inverse/40 px-3 py-1 text-body-sm font-semibold backdrop-blur">
            <span className="size-1.5 rounded-full bg-success-inverse" aria-hidden />
            Personal training in your community
          </p>

          <div className="grid gap-8">
            <p className="max-w-md font-display text-display-lg">
              A trainer at your building, <em className="text-success-inverse">within the hour.</em>
            </p>

            <div className="max-w-sm rounded-lg border border-ink-inverse/15 bg-inverse/50 p-4 shadow-(--shadow-3) backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-md bg-ink-inverse/10" aria-hidden>
                  <CalendarCheck className="size-5 text-success-inverse" />
                </span>
                <div className="min-w-0">
                  <p className="text-body-sm text-ink-inverse/70">Example booking</p>
                  <p className="font-semibold">Tomorrow · 7:00 AM · Strength</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-ink-inverse/10 pt-3 text-body-sm">
                <span className="text-ink-inverse/70">Tower B gym · 60 min</span>
                <span className="font-semibold text-success-inverse">Confirmed</span>
              </div>
            </div>

            <ul className="grid gap-2.5 text-ink-inverse/85">
              {[
                "Instant or scheduled 60-minute sessions",
                "The exact price before you pay",
                "Every session and note kept on record",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span
                    className="grid size-5 place-items-center rounded-full bg-success-inverse/15 text-success-inverse"
                    aria-hidden
                  >
                    <Check className="size-3.5" strokeWidth={2.5} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

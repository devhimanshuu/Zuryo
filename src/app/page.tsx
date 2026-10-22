import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  House,
  MapPin,
  NotebookPen,
  ShieldCheck,
  Timer,
  UserRoundCheck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { FitnessImage } from "@/components/shared/fitness-image";
import { Button } from "@/components/ui/button";
import { IMAGES } from "@/lib/config/images";
import MarketingLayout from "./(marketing)/layout";

const BOOK_HREF = "/sign-in?callbackUrl=%2Fcustomer%2Fbookings%2Fnew";

export default function HomePage() {
  return (
    <MarketingLayout>
      <Hero />
      <HowItWorks />
      <InstantOrScheduled />
      <Benefits />
      <TrainerPreview />
      <FinalCta />
    </MarketingLayout>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-56 left-[12%] h-[520px] w-[720px] rounded-full bg-brand-soft/80 blur-3xl" />
        <div className="absolute top-24 -right-32 h-[420px] w-[520px] rounded-full bg-accent-soft/60 blur-3xl" />
        <div className="absolute inset-0 bg-dot-grid fade-radial text-ink/[0.06]" />
      </div>

      <div className="container-page grid items-center gap-12 pt-10 pb-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-16 lg:pb-28">
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-raised/80 py-1 pr-3 pl-1.5 text-body-sm font-semibold text-ink-muted shadow-(--shadow-1) backdrop-blur">
            <span className="grid size-5 place-items-center rounded-full bg-brand-soft">
              <MapPin className="size-3 text-brand" aria-hidden />
            </span>
            Personal training inside your residential community
          </p>
          <h1 className="mt-6 font-display text-[2.75rem] leading-[1.02] tracking-tight sm:text-display-lg lg:text-display-xl">
            A personal trainer at your building, <em className="text-brand">within the hour.</em>
          </h1>
          <p className="mt-5 max-w-xl text-body-lg text-ink-muted">
            Zuryo books a qualified trainer for a 60-minute session in your society&apos;s gym, lawn or
            terrace. Start now or pick a time this week, see the exact price before you pay, and keep every
            session on record.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="lg" className="group shadow-(--shadow-2)">
              <Link href={BOOK_HREF}>
                Sign in to book a trainer{" "}
                <ArrowRight
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/how-it-works">How it works</Link>
            </Button>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-hairline border-t border-hairline pt-6">
            {[
              { value: "60 min", label: "Every session" },
              { value: "< 1 hr", label: "Instant start" },
              { value: "₹0", label: "Hidden fees" },
            ].map((s, i) => (
              <div
                key={s.label}
                className={i === 0 ? "flex flex-col-reverse pr-4" : "flex flex-col-reverse px-4"}
              >
                <dt className="mt-1 text-body-sm text-ink-muted">{s.label}</dt>
                <dd className="font-display text-[1.75rem] leading-none tracking-tight sm:text-display-md">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative animate-rise [animation-delay:120ms]">
          <FitnessImage
            image={IMAGES.hero}
            priority
            sizes="(min-width: 1024px) 560px, 100vw"
            className="aspect-[4/5] rounded-lg shadow-(--shadow-3) ring-1 ring-ink/5 sm:aspect-[5/4] lg:aspect-[4/5]"
          />
          <div
            aria-hidden
            className="absolute top-5 -left-3 hidden items-center gap-2.5 rounded-full border border-hairline bg-raised/95 py-1.5 pr-4 pl-1.5 shadow-(--shadow-2) backdrop-blur sm:flex lg:-left-6"
          >
            <span className="grid size-7 place-items-center rounded-full bg-success-soft text-success">
              <Check className="size-4" strokeWidth={2.5} />
            </span>
            <span className="text-body-sm font-semibold">Trainer assigned</span>
            <span className="text-body-sm text-ink-muted tabular">10:00 AM</span>
          </div>
          <BookingPreview />
        </div>
      </div>
    </section>
  );
}

/** A static, labelled preview of the booking flow built from the same visual language as the app. */
function BookingPreview() {
  const slots = [
    { t: "7:00 AM", peak: true, taken: true },
    { t: "10:00 AM", peak: false, selected: true },
    { t: "11:00 AM", peak: false },
  ];
  return (
    <figure
      aria-label="Preview of choosing a session time"
      className="absolute right-3 -bottom-8 left-3 rounded-lg border border-hairline bg-raised/95 p-4 shadow-(--shadow-3) backdrop-blur sm:right-auto sm:left-6 sm:w-[340px]"
    >
      <figcaption className="flex items-center justify-between text-body-sm">
        <span className="font-semibold">Thu · Palm Grove Residences</span>
        <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-subtle">
          Preview
        </span>
      </figcaption>
      <div className="mt-3 grid grid-cols-3 gap-2" aria-hidden>
        {slots.map((s) => (
          <div
            key={s.t}
            className={
              s.selected
                ? "rounded-md border border-brand bg-brand-soft px-2 py-2 ring-1 ring-brand"
                : s.taken
                  ? "rounded-md border border-hairline bg-sunken px-2 py-2 text-ink-subtle line-through"
                  : "rounded-md border border-control px-2 py-2"
            }
          >
            <p className="text-sm font-semibold tabular">{s.t}</p>
            <p className="text-[11px] text-ink-muted">{s.taken ? "Full" : s.peak ? "Peak" : "Open"}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-md bg-sunken p-2.5">
        <span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-semibold text-on-brand">
          AM
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Arjun M. · Strength</p>
          <p className="text-[12px] text-ink-muted">Available at 10:00 AM</p>
        </div>
        <ShieldCheck className="size-4 text-brand" aria-hidden />
      </div>
    </figure>
  );
}

const STEPS = [
  {
    icon: Zap,
    title: "Choose now or later",
    body: "Instant finds a trainer for a session starting within the next hour. Scheduled lets you pick a slot up to a month ahead.",
  },
  {
    icon: UserRoundCheck,
    title: "Get matched to a trainer",
    body: "Zuryo assigns an available trainer who serves your community, or you can pick a preferred trainer if they're free.",
  },
  {
    icon: ShieldCheck,
    title: "See the price, then pay",
    body: "The session price and society commission are itemised before checkout, and the total you see is the total you pay.",
  },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="border-y border-hairline bg-raised py-20 lg:py-24">
      <div className="container-page">
        <SectionIntro
          id="how-heading"
          eyebrow="How it works"
          title="Booked in three steps"
          body="Designed to feel like booking a ride, with the care of a good personal trainer."
        />
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="group relative overflow-hidden rounded-lg border border-hairline bg-surface/60 p-6 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-raised hover:shadow-(--shadow-2) lg:p-7"
            >
              <div className="flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-full bg-brand text-on-brand shadow-(--shadow-2)">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span
                  className="font-display text-display-lg leading-none text-ink/10 tabular transition-colors group-hover:text-brand/25"
                  aria-hidden
                >
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-6 text-heading-md font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function InstantOrScheduled() {
  return (
    <section
      id="instant-or-scheduled"
      aria-labelledby="modes-heading"
      className="container-page scroll-mt-20 py-20 lg:py-28"
    >
      <SectionIntro
        id="modes-heading"
        eyebrow="Two ways to book"
        title="Right now, or when it suits you"
        body="Both modes are 60-minute sessions with the same trainers and the same transparent pricing."
      />
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <article className="relative isolate flex flex-col overflow-hidden rounded-lg border border-hairline bg-raised p-6 shadow-(--shadow-1) lg:p-8">
          <div
            aria-hidden
            className="absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-accent-soft/80 blur-3xl"
          />
          <span className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-text">
            <Zap className="size-3.5" aria-hidden /> Instant
          </span>
          <h3 className="mt-4 font-display text-display-md">Start within the hour</h3>
          <p className="mt-2 text-ink-muted">
            Free this evening? Request a session and Zuryo looks for a trainer nearby who can start within 60
            minutes. If nobody is free, you&apos;ll see the next available times instead of waiting.
          </p>
          <ul className="mt-5 grid gap-2 text-body-md">
            <Bullet>Live status from request to trainer assigned</Bullet>
            <Bullet>Honest fallback when no trainer is available</Bullet>
          </ul>
          <div aria-hidden className="mt-auto pt-7">
            <div className="rounded-md border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between text-body-sm">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <span className="relative flex size-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative size-2 rounded-full bg-accent" />
                  </span>
                  Finding a trainer nearby
                </span>
                <span className="text-ink-muted tabular">00:42</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full w-2/3 rounded-full bg-accent" />
              </div>
              <div className="mt-2.5 flex justify-between text-[12px] text-ink-muted">
                <span>Requested</span>
                <span className="font-semibold text-ink">Matching</span>
                <span>Assigned</span>
              </div>
            </div>
          </div>
        </article>
        <article className="relative isolate flex flex-col overflow-hidden rounded-lg border border-hairline bg-raised p-6 shadow-(--shadow-1) lg:p-8">
          <div
            aria-hidden
            className="absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-brand-soft blur-3xl"
          />
          <span className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">
            <CalendarDays className="size-3.5" aria-hidden /> Scheduled
          </span>
          <h3 className="mt-4 font-display text-display-md">Plan your week</h3>
          <p className="mt-2 text-ink-muted">
            Pick a day and a 60-minute slot. Peak hours are marked on each slot, so you always know what
            you&apos;ll pay before choosing.
          </p>
          <ul className="mt-5 grid gap-2 text-body-md">
            <Bullet>Choose a preferred trainer when they&apos;re free</Bullet>
            <Bullet>Reschedule or cancel from your bookings</Bullet>
          </ul>
          <div aria-hidden className="mt-auto pt-7">
            <div className="grid grid-cols-7 gap-1.5 rounded-md border border-hairline bg-surface p-3">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => {
                const selected = i === 3;
                return (
                  <div
                    key={i}
                    className={
                      selected
                        ? "rounded-md bg-brand py-2 text-center text-on-brand shadow-(--shadow-2)"
                        : "rounded-md py-2 text-center"
                    }
                  >
                    <p
                      className={
                        selected ? "text-[11px] font-semibold opacity-80" : "text-[11px] text-ink-subtle"
                      }
                    >
                      {d}
                    </p>
                    <p className="text-sm font-semibold tabular">{20 + i}</p>
                    <span
                      className={
                        i === 5 || i === 6
                          ? "mx-auto mt-1 block size-1 rounded-full bg-accent"
                          : "mx-auto mt-1 block size-1 rounded-full bg-transparent"
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

const BENEFITS = [
  {
    icon: House,
    title: "No commute",
    body: "Train in your society's gym, on the lawn or on your terrace. Your session starts when you walk downstairs.",
  },
  {
    icon: Clock,
    title: "Fits around your day",
    body: "Early mornings, lunch breaks or after work. Book instantly or plan ahead without memberships.",
  },
  {
    icon: NotebookPen,
    title: "Progress on record",
    body: "Trainers log what you did and suggest what's next, so every session builds on the last.",
  },
];

function Benefits() {
  return (
    <section aria-labelledby="benefits-heading" className="container-page pb-20 lg:pb-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
        <div className="relative">
          <div aria-hidden className="absolute -inset-3 -z-10 rounded-[20px] bg-brand-soft/60 lg:-inset-4" />
          <FitnessImage
            image={IMAGES.community}
            sizes="(min-width: 1024px) 520px, 100vw"
            className="aspect-[4/3] rounded-lg shadow-(--shadow-2)"
          />
        </div>
        <div>
          <SectionIntro
            id="benefits-heading"
            eyebrow="Why train with Zuryo"
            title="Personal training that comes to you"
          />
          <ul className="mt-8 grid divide-y divide-hairline border-y border-hairline">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-4 py-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-soft text-brand ring-1 ring-brand/10">
                  <b.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-heading-md font-semibold">{b.title}</h3>
                  <p className="mt-1 text-ink-muted">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function TrainerPreview() {
  return (
    <section
      id="for-trainers"
      aria-labelledby="trainers-heading"
      className="relative isolate scroll-mt-16 overflow-hidden bg-inverse py-20 text-ink-inverse lg:py-28"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-dot-grid fade-radial text-ink-inverse/[0.06]" />
        <div className="absolute top-1/2 right-[8%] size-[440px] -translate-y-1/2 rounded-full bg-brand/50 blur-3xl" />
      </div>
      <div className="container-page grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <p className="flex items-center gap-3 text-eyebrow font-semibold tracking-[0.08em] text-ink-inverse/60 uppercase">
            <span className="h-px w-6 bg-success-inverse" aria-hidden />
            For trainers
          </p>
          <h2 id="trainers-heading" className="mt-3 font-display text-display-md lg:text-display-lg">
            A workspace built for the session, not the spreadsheet
          </h2>
          <p className="mt-4 max-w-xl text-body-lg text-ink-inverse/80">
            Trainers see today&apos;s schedule, set their availability and run each session from one screen.
            The session clock is kept by the server, so it stays accurate even if a phone locks or the page
            reloads.
          </p>
          <ul className="mt-6 grid gap-2 text-ink-inverse/90">
            <Bullet inverse>Availability that can&apos;t clash with existing bookings</Bullet>
            <Bullet inverse>A five-minute warning before the hour is up</Bullet>
            <Bullet inverse>Quick notes and a suggested next workout for each client</Bullet>
          </ul>
        </div>
        <figure
          aria-label="Preview of the trainer's live session screen"
          className="rounded-lg border border-ink-inverse/15 bg-ink-inverse/[0.05] p-5 shadow-(--shadow-3) backdrop-blur sm:p-7"
        >
          <figcaption className="flex items-center justify-between text-body-sm">
            <span className="inline-flex items-center gap-2 font-semibold tracking-[0.06em] uppercase">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative size-2 rounded-full bg-accent" />
              </span>
              Session in progress
            </span>
            <span className="rounded-full bg-ink-inverse/10 px-2 py-0.5 text-[11px] font-semibold text-ink-inverse/70">
              Preview
            </span>
          </figcaption>
          <p
            className="mt-5 text-[4rem] leading-none font-medium tracking-tight tabular sm:text-numeric-xl"
            aria-hidden
          >
            37:17
          </p>
          <p className="mt-1 text-body-sm text-ink-inverse/70">remaining · Priya S. · Tower B gym</p>
          <div className="relative mt-6 h-2 rounded-full bg-ink-inverse/15" aria-hidden>
            <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-success-inverse" />
            <div className="absolute -inset-y-1 left-[91.6%] w-0.5 bg-ink-inverse/60" />
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-ink-inverse/60" aria-hidden>
            <span>0</span>
            <span>55</span>
            <span>60 min</span>
          </div>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-ink-inverse/10 pt-4 text-body-sm text-ink-inverse/80">
            <span className="inline-flex items-center gap-2">
              <Timer className="size-4" aria-hidden /> Started 9:02 AM · ends 10:02 AM
            </span>
            <span
              className="hidden rounded-md bg-ink-inverse/10 px-2.5 py-1 font-semibold sm:inline"
              aria-hidden
            >
              Complete
            </span>
          </div>
        </figure>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container-page py-20 lg:py-28">
      <div className="relative isolate overflow-hidden rounded-lg bg-brand px-6 py-12 text-on-brand shadow-(--shadow-3) sm:px-10 lg:px-14 lg:py-16">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-dot-grid fade-radial text-on-brand/[0.08]" />
          <div className="absolute -right-24 -bottom-40 size-[420px] rounded-full bg-brand-strong blur-2xl" />
          <div className="absolute -top-32 -left-16 size-80 rounded-full bg-accent/25 blur-3xl" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[1.4fr_auto] lg:items-center lg:gap-12">
          <div>
            <h2 className="font-display text-display-md lg:text-display-lg">
              Your next workout is downstairs.
            </h2>
            <p className="mt-3 max-w-lg text-body-lg text-on-brand/85">
              Choose an open time, see your trainer match and price, then confirm the session.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Button asChild variant="inverse" size="lg" className="group shadow-(--shadow-2)">
              <Link href={BOOK_HREF}>
                Sign in to book a trainer{" "}
                <ArrowRight
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="border-on-brand/40 bg-transparent text-on-brand hover:bg-on-brand/10"
            >
              <Link href="/how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionIntro({
  id,
  eyebrow,
  title,
  body,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="flex items-center gap-3 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
        <span className="h-px w-6 bg-brand" aria-hidden />
        {eyebrow}
      </p>
      <h2 id={id} className="mt-3 font-display text-display-md lg:text-display-lg">
        {title}
      </h2>
      {body ? <p className="mt-3 text-body-lg text-ink-muted">{body}</p> : null}
    </div>
  );
}

function Bullet({ children, inverse }: { children: React.ReactNode; inverse?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={
          inverse
            ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-inverse/15 text-success-inverse"
            : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
        }
        aria-hidden
      >
        <Check className="size-3.5" strokeWidth={2.5} />
      </span>
      <span>{children}</span>
    </li>
  );
}

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
    <section className="container-page grid items-center gap-10 pt-8 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-14 lg:pb-24">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-raised px-3 py-1 text-body-sm font-semibold text-ink-muted">
          <MapPin className="size-3.5 text-brand" aria-hidden />
          Personal training inside your residential community
        </p>
        <h1 className="mt-5 font-display text-[2.75rem] leading-[1.02] tracking-tight sm:text-display-lg lg:text-display-xl">
          A personal trainer at your building, <em className="text-brand">within the hour.</em>
        </h1>
        <p className="mt-5 max-w-xl text-body-lg text-ink-muted">
          Zuryo books a qualified trainer for a 60-minute session in your society&apos;s gym, lawn or terrace.
          Start now or pick a time this week, see the exact price before you pay, and keep every session on
          record.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="primary" size="lg">
            <Link href="/customer/bookings/new">
              Book a trainer <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/how-it-works">How it works</Link>
          </Button>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-ink-muted">
          {["60-minute sessions", "Instant or scheduled", "Price shown before you pay"].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Check className="size-4 text-brand" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative">
        <FitnessImage
          image={IMAGES.hero}
          priority
          sizes="(min-width: 1024px) 560px, 100vw"
          className="aspect-[4/5] rounded-lg sm:aspect-[5/4] lg:aspect-[4/5]"
        />
        <BookingPreview />
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
      className="absolute right-3 -bottom-8 left-3 rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-3) sm:right-auto sm:left-6 sm:w-[340px]"
    >
      <figcaption className="flex items-center justify-between text-body-sm">
        <span className="font-semibold">Thu · Palm Grove Residences</span>
        <span className="text-ink-subtle">Preview</span>
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
        <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
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
    <section aria-labelledby="how-heading" className="border-y border-hairline bg-raised py-16 lg:py-20">
      <div className="container-page">
        <SectionIntro
          id="how-heading"
          eyebrow="How it works"
          title="Booked in three steps"
          body="Designed to feel like booking a ride, with the care of a good personal trainer."
        />
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-brand text-on-brand">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="text-eyebrow font-semibold tracking-[0.08em] text-ink-subtle uppercase tabular">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-heading-md font-semibold">{s.title}</h3>
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
      className="container-page scroll-mt-20 py-16 lg:py-24"
    >
      <SectionIntro
        id="modes-heading"
        eyebrow="Two ways to book"
        title="Right now, or when it suits you"
        body="Both modes are 60-minute sessions with the same trainers and the same transparent pricing."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <article className="rounded-lg border border-hairline bg-raised p-6 lg:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-text">
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
        </article>
        <article className="rounded-lg border border-hairline bg-raised p-6 lg:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">
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
    <section aria-labelledby="benefits-heading" className="container-page pb-16 lg:pb-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
        <FitnessImage
          image={IMAGES.community}
          sizes="(min-width: 1024px) 520px, 100vw"
          className="aspect-[4/3] rounded-lg"
        />
        <div>
          <SectionIntro
            id="benefits-heading"
            eyebrow="Why train with Zuryo"
            title="Personal training that comes to you"
          />
          <ul className="mt-8 grid gap-6">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
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
      className="scroll-mt-16 bg-inverse py-16 text-ink-inverse lg:py-24"
    >
      <div className="container-page grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-inverse/60 uppercase">
            For trainers
          </p>
          <h2 id="trainers-heading" className="mt-2 font-display text-display-md lg:text-display-lg">
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
          className="rounded-lg border border-ink-inverse/15 bg-ink-inverse/[0.04] p-5 sm:p-6"
        >
          <figcaption className="flex items-center justify-between text-body-sm">
            <span className="inline-flex items-center gap-2 font-semibold tracking-[0.06em] uppercase">
              <span className="size-2 rounded-full bg-accent" aria-hidden /> Session in progress
            </span>
            <span className="text-ink-inverse/60">Preview</span>
          </figcaption>
          <p
            className="mt-4 text-[4rem] leading-none font-medium tracking-tight tabular sm:text-numeric-xl"
            aria-hidden
          >
            37:17
          </p>
          <p className="mt-1 text-body-sm text-ink-inverse/70">remaining · Priya S. · Tower B gym</p>
          <div className="relative mt-5 h-2 rounded-full bg-ink-inverse/15" aria-hidden>
            <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-success-inverse" />
            <div className="absolute -inset-y-1 left-[91.6%] w-0.5 bg-ink-inverse/60" />
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-ink-inverse/60" aria-hidden>
            <span>0</span>
            <span>55</span>
            <span>60 min</span>
          </div>
          <div className="mt-5 flex items-center gap-2 text-body-sm text-ink-inverse/80">
            <Timer className="size-4" aria-hidden /> Started 9:02 AM · ends 10:02 AM
          </div>
        </figure>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="container-page py-16 lg:py-24">
      <div className="grid gap-8 rounded-lg bg-brand p-8 text-on-brand sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:p-14">
        <div>
          <h2 className="font-display text-display-md lg:text-display-lg">
            Your next workout is downstairs.
          </h2>
          <p className="mt-3 max-w-lg text-body-lg text-on-brand/85">
            Explore the customer experience with a demo account, or see how trainers and operations teams
            work.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Button asChild variant="inverse" size="lg">
            <Link href="/customer/bookings/new">
              Book a trainer <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="border-on-brand/40 bg-transparent text-on-brand hover:bg-on-brand/10"
          >
            <Link href="/sign-in">Sign in to explore</Link>
          </Button>
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
      <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-display-md lg:text-display-lg">
        {title}
      </h2>
      {body ? <p className="mt-3 text-body-lg text-ink-muted">{body}</p> : null}
    </div>
  );
}

function Bullet({ children, inverse }: { children: React.ReactNode; inverse?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <Check
        className={
          inverse ? "mt-0.5 size-4 shrink-0 text-success-inverse" : "mt-0.5 size-4 shrink-0 text-brand"
        }
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

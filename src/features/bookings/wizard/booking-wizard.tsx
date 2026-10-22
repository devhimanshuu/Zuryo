"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CalendarClock, Clock, MapPin, RotateCcw, SearchX, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { categoryLabel } from "@/lib/booking/categories";
import {
  INSTANT_MIN_LEAD_MINUTES,
  INSTANT_WINDOW_MINUTES,
  NOTES_MAX_LENGTH,
  SESSION_MINUTES,
} from "@/lib/booking/rules";
import { localDateKey } from "@/lib/booking/time";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { formatDay, formatSlot, formatTime } from "@/lib/utils/format";
import { bookingNotesSchema } from "@/lib/validation/booking";
import { workoutCategorySchema, type BookingMode, type WorkoutCategory } from "@/lib/validation/enums";
import type { BookingPayment } from "@/lib/validation/payments";
import {
  createBookingAction,
  getInstantOfferAction,
  getMatchesAction,
  getScheduleAction,
} from "@/server/actions/bookings";
import type { ScheduleView } from "@/server/booking/availability-service";
import type { ServiceError, SlotSuggestion } from "@/server/booking/errors";
import type { MatchResult } from "@/server/booking/matching-service";
import { PriceBreakdown } from "../price-breakdown";
import { CATEGORY_ICON, MODE_ICON, call, choiceCard, type Loadable } from "./shared";
import { SlotPicker } from "./slot-picker";
import { Stepper, type StepDef } from "./stepper";
import { PaymentChoice, defaultPayment, usablePackages, type WizardPackage } from "./payment-choice";
import { TrainerPicker } from "./trainer-picker";

type Step = "type" | "workout" | "time" | "trainer" | "review";

const STEPS: StepDef<Step>[] = [
  { id: "type", label: "Type" },
  { id: "workout", label: "Workout" },
  { id: "time", label: "Time" },
  { id: "trainer", label: "Trainer" },
  { id: "review", label: "Review" },
];

export type WizardCategory = {
  value: WorkoutCategory;
  label: string;
  description: string;
  trainerCount: number;
};

export type WizardProps = {
  customer: { name: string; zoneName: string; addressLine: string | null; timeZone: string };
  categories: WizardCategory[];
  /** The customer's active packages with sessions left (the server re-checks on confirm). */
  packages: WizardPackage[];
  initialMode?: BookingMode | null;
  /** Pre-selected workout, e.g. carried over from a recommendation. The customer still reviews it. */
  initialCategory?: WorkoutCategory | null;
};

const workoutFormSchema = z.object({ workoutCategory: workoutCategorySchema, notes: bookingNotesSchema });

const noopSubscribe = () => () => {};

export function BookingWizard({ customer, categories, packages, initialMode, initialCategory }: WizardProps) {
  const router = useRouter();
  const tz = customer.timeZone;
  // False during SSR and until React hydrates. Submit buttons wait for it, so a click on the
  // server-rendered HTML can't fall back to a native form submission (which would put notes in the URL).
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [step, setStep] = useState<Step>(initialMode ? "workout" : "type");
  const [mode, setMode] = useState<BookingMode | null>(initialMode ?? null);
  const [category, setCategory] = useState<WorkoutCategory | null>(null);
  const [notes, setNotes] = useState("");
  const [schedule, setSchedule] = useState<Loadable<ScheduleView>>({ status: "idle" });
  const [scheduleFor, setScheduleFor] = useState<WorkoutCategory | null>(null);
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [match, setMatch] = useState<Loadable<MatchResult>>({ status: "idle" });
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<ServiceError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<BookingPayment | null>(null);

  // Latest-request guards: a slow response for an old selection never overwrites a newer one.
  const scheduleSeq = useRef(0);
  const matchSeq = useRef(0);
  const idempotency = useRef<{ signature: string; key: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const workoutForm = useForm<z.input<typeof workoutFormSchema>, unknown, z.output<typeof workoutFormSchema>>(
    {
      resolver: zodResolver(workoutFormSchema),
      defaultValues: { workoutCategory: initialCategory ?? undefined, notes: "" },
    },
  );

  // ─── Data loading ───────────────────────────────────────────────────────

  async function loadSchedule(cat: WorkoutCategory) {
    const seq = ++scheduleSeq.current;
    setSchedule({ status: "loading" });
    const res = await call(getScheduleAction, { workoutCategory: cat });
    if (seq !== scheduleSeq.current) return;
    if (!res.ok) {
      setSchedule({ status: "error", error: res.error });
      return;
    }
    const data = res.data;
    setSchedule({ status: "ready", data });
    setScheduleFor(cat);
    setDateKey((prev) =>
      prev && data.days.some((d) => d.dateKey === prev)
        ? prev
        : ((data.days.find((d) => d.availableCount > 0) ?? data.days[0])?.dateKey ?? null),
    );
    setStartAt((prev) =>
      prev && data.days.some((d) => d.slots.some((s) => s.startAt === prev && s.status === "AVAILABLE"))
        ? prev
        : null,
    );
  }

  async function loadInstant(cat: WorkoutCategory) {
    const seq = ++matchSeq.current;
    setMatch({ status: "loading" });
    setStartAt(null);
    setTrainerId(null);
    const res = await call(getInstantOfferAction, { workoutCategory: cat });
    if (seq !== matchSeq.current) return;
    if (!res.ok) {
      setMatch({ status: "error", error: res.error });
      return;
    }
    setMatch({ status: "ready", data: res.data });
    setStartAt(res.data.startAt);
    setTrainerId(res.data.trainers[0]?.trainerId ?? null);
  }

  async function loadMatches(cat: WorkoutCategory, start: string, m: BookingMode) {
    const seq = ++matchSeq.current;
    setMatch({ status: "loading" });
    const res = await call(getMatchesAction, { workoutCategory: cat, startAt: start, mode: m });
    if (seq !== matchSeq.current) return;
    if (!res.ok) {
      setMatch({ status: "error", error: res.error });
      return;
    }
    setMatch({ status: "ready", data: res.data });
    setTrainerId((prev) =>
      prev && res.data.trainers.some((t) => t.trainerId === prev)
        ? prev
        : (res.data.trainers[0]?.trainerId ?? null),
    );
  }

  // ─── Transitions ────────────────────────────────────────────────────────

  function chooseMode(next: BookingMode) {
    if (next === mode) return;
    setMode(next);
    setStartAt(null);
    setTrainerId(null);
    setMatch({ status: "idle" });
    setSubmitError(null);
  }

  function enterTime(cat: WorkoutCategory, m: BookingMode) {
    setSubmitError(null);
    setStep("time");
    if (m === "INSTANT") void loadInstant(cat);
    else if (scheduleFor !== cat || schedule.status !== "ready") void loadSchedule(cat);
  }

  const submitWorkout = workoutForm.handleSubmit((values) => {
    if (!mode) return;
    const cat = values.workoutCategory;
    if (cat !== category) {
      setStartAt(null);
      setTrainerId(null);
      setMatch({ status: "idle" });
      setDateKey(null);
    }
    setCategory(cat);
    setNotes(values.notes ?? "");
    enterTime(cat, mode);
  });

  function continueFromTime() {
    if (!category || !startAt || !mode) return;
    setStep("trainer");
    if (mode === "SCHEDULED") void loadMatches(category, startAt, "SCHEDULED");
  }

  /** Switch to a suggested scheduled slot (from an empty instant search or a conflict). */
  function pickSuggestion(s: SlotSuggestion) {
    if (!category) return;
    setMode("SCHEDULED");
    setStartAt(s.startAt);
    setDateKey(localDateKey(new Date(s.startAt), tz));
    setSubmitError(null);
    setStep("trainer");
    void loadMatches(category, s.startAt, "SCHEDULED");
    if (scheduleFor !== category || schedule.status !== "ready") void loadSchedule(category);
  }

  async function confirm() {
    if (!mode || !category || !startAt || match.status !== "ready" || !trainerId) return;
    const signature = [mode, category, startAt, trainerId, notes, JSON.stringify(payment)].join("|");
    if (idempotency.current?.signature !== signature) {
      idempotency.current = { signature, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    setSubmitError(null);
    const res = await call(createBookingAction, {
      mode,
      workoutCategory: category,
      startAt,
      preferredTrainerId: trainerId,
      notes: notes || undefined,
      expectedTotal: match.data.quote.totalAmount,
      payment,
      idempotencyKey: idempotency.current.key,
    });
    if (res.ok) {
      router.push(`/customer/bookings/${res.data.id}?created=1`);
      return; // keep the button busy while the confirmation page loads
    }
    setSubmitting(false);
    if (res.error.code === "PRICE_CHANGED" && res.error.quote) {
      setMatch({ status: "ready", data: { ...match.data, quote: res.error.quote } });
    }
    // A declined payment is final for that request; the next confirm is a new attempt with a new key.
    if (res.error.code === "PAYMENT_FAILED") idempotency.current = null;
    setSubmitError(res.error);
  }

  const reachable = (id: Step) => {
    const order = STEPS.findIndex((s) => s.id === id);
    const current = STEPS.findIndex((s) => s.id === step);
    return order < current && !submitting;
  };

  // The customer's choice, unless it names a package that can't cover the chosen slot.
  const payment: BookingPayment = !startAt
    ? { method: "SIMULATED_PAYMENT", outcome: "SUCCEED" }
    : paymentChoice &&
        (paymentChoice.method !== "PACKAGE" ||
          usablePackages(packages, startAt).some((p) => p.id === paymentChoice.packageId))
      ? paymentChoice
      : defaultPayment(packages, startAt);

  const selectedTrainer =
    match.status === "ready" ? match.data.trainers.find((t) => t.trainerId === trainerId) : undefined;
  const quote = match.status === "ready" ? match.data.quote : null;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <Stepper steps={STEPS} current={step} reachable={reachable} onSelect={setStep} />

        <section className="mt-8" aria-labelledby="step-heading">
          {step === "type" ? (
            <StepFrame
              headingRef={headingRef}
              title="How soon do you want to train?"
              description="Both are 60-minute sessions with a trainer from your community."
            >
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Session type</legend>
                {(
                  [
                    {
                      value: "INSTANT",
                      title: "Instant",
                      tag: "Within the hour",
                      body: `We find the earliest trainer who can start ${INSTANT_MIN_LEAD_MINUTES}–${INSTANT_WINDOW_MINUTES} minutes from now. If nobody can, we'll say so and suggest the next open times.`,
                    },
                    {
                      value: "SCHEDULED",
                      title: "Scheduled",
                      tag: "Pick a day and time",
                      body: "Choose an open slot more than an hour from now, up to two weeks ahead, and see who's free.",
                    },
                  ] as const
                ).map((o) => {
                  const Icon = MODE_ICON[o.value];
                  return (
                    <label key={o.value} className={cn(choiceCard, "flex-col")}>
                      <input
                        type="radio"
                        name="mode"
                        value={o.value}
                        checked={mode === o.value}
                        onChange={() => chooseMode(o.value)}
                        className="sr-only"
                        aria-labelledby={`mode-${o.value}-title`}
                        aria-describedby={`mode-${o.value}-body`}
                      />
                      <span
                        className={cn(
                          "grid size-11 place-items-center rounded-full",
                          o.value === "INSTANT"
                            ? "bg-accent-soft text-accent-text"
                            : "bg-brand-soft text-brand",
                        )}
                        aria-hidden
                      >
                        <Icon className="size-5" />
                      </span>
                      <span id={`mode-${o.value}-title`}>
                        <span className="block text-heading-md font-semibold">{o.title}</span>
                        <span className="block text-body-sm font-semibold text-ink-muted">{o.tag}</span>
                      </span>
                      <span id={`mode-${o.value}-body`} className="text-body-sm text-ink-muted">
                        {o.body}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <StepFooter>
                <span />
                <Button variant="primary" disabled={!mode || !hydrated} onClick={() => setStep("workout")}>
                  Continue <ArrowRight aria-hidden />
                </Button>
              </StepFooter>
            </StepFrame>
          ) : null}

          {step === "workout" ? (
            <StepFrame
              headingRef={headingRef}
              title="What would you like to work on?"
              description={`Trainers are matched to the workout you choose, from ${customer.zoneName}.`}
            >
              {initialCategory ? (
                <Notice tone="info" className="-mt-2">
                  Pre-filled from your workout recommendation:{" "}
                  <strong>{categoryLabel(initialCategory)}</strong>. Change it if you like — the rest of the
                  booking works exactly as usual.
                </Notice>
              ) : null}
              <form onSubmit={submitWorkout} method="post" noValidate className="grid gap-6">
                <fieldset className="min-w-0">
                  <legend className="sr-only">Workout type</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {categories.map((c) => {
                      const Icon = CATEGORY_ICON[c.value];
                      const none = c.trainerCount === 0;
                      return (
                        <label key={c.value} className={choiceCard}>
                          <input
                            type="radio"
                            value={c.value}
                            disabled={none}
                            className="sr-only"
                            aria-labelledby={`cat-${c.value}-label`}
                            aria-describedby={`cat-${c.value}-desc`}
                            {...workoutForm.register("workoutCategory")}
                          />
                          <span
                            className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-ink"
                            aria-hidden
                          >
                            <Icon className="size-5" />
                          </span>
                          <span className="min-w-0">
                            <span id={`cat-${c.value}-label`} className="block font-semibold">
                              {c.label}
                            </span>
                            <span id={`cat-${c.value}-desc`} className="block text-body-sm text-ink-muted">
                              {c.description}
                              <span
                                className={cn(
                                  "mt-1 block font-semibold",
                                  none ? "text-ink-subtle" : "text-brand",
                                )}
                              >
                                {none
                                  ? "No trainer in your community yet"
                                  : `${c.trainerCount} trainer${c.trainerCount === 1 ? "" : "s"} nearby`}
                              </span>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {workoutForm.formState.errors.workoutCategory ? (
                    <p className="mt-2 text-body-sm text-danger" role="alert">
                      Choose a workout type to continue.
                    </p>
                  ) : null}
                </fieldset>

                <div className="grid gap-1.5">
                  <Label htmlFor="booking-notes">
                    Notes for your trainer <span className="font-normal text-ink-subtle">(optional)</span>
                  </Label>
                  <Textarea
                    id="booking-notes"
                    rows={3}
                    maxLength={NOTES_MAX_LENGTH}
                    placeholder="Focus areas, equipment you have at home, where to meet…"
                    aria-describedby="booking-notes-help"
                    aria-invalid={workoutForm.formState.errors.notes ? true : undefined}
                    {...workoutForm.register("notes")}
                  />
                  <p
                    id="booking-notes-help"
                    className="flex justify-between gap-3 text-body-sm text-ink-subtle"
                  >
                    <span>Please don&apos;t include medical details here.</span>
                    <span className="tabular">
                      {(workoutForm.watch("notes") ?? "").length}/{NOTES_MAX_LENGTH}
                    </span>
                  </p>
                  {workoutForm.formState.errors.notes ? (
                    <p className="text-body-sm text-danger">{workoutForm.formState.errors.notes.message}</p>
                  ) : null}
                </div>

                <StepFooter>
                  <Button type="button" variant="ghost" onClick={() => setStep("type")}>
                    <ArrowLeft aria-hidden /> Back
                  </Button>
                  <Button type="submit" variant="primary" disabled={!hydrated}>
                    {mode === "INSTANT" ? "Find a trainer now" : "See available times"}{" "}
                    <ArrowRight aria-hidden />
                  </Button>
                </StepFooter>
              </form>
            </StepFrame>
          ) : null}

          {step === "time" && mode === "SCHEDULED" && category ? (
            <StepFrame
              headingRef={headingRef}
              title="Pick a time"
              description={`${categoryLabel(category)} · ${SESSION_MINUTES} minutes · times in IST`}
            >
              {schedule.status === "loading" || schedule.status === "idle" ? (
                <SlotsSkeleton />
              ) : schedule.status === "error" ? (
                <ErrorWithRetry error={schedule.error} onRetry={() => void loadSchedule(category)} />
              ) : (
                <SlotPicker
                  schedule={schedule.data}
                  dateKey={dateKey}
                  selected={startAt}
                  onDate={(k) => setDateKey(k)}
                  onSelect={(s) => {
                    setStartAt(s);
                    setSubmitError(null);
                  }}
                  onRefresh={() => void loadSchedule(category)}
                />
              )}
              <StepFooter>
                <Button type="button" variant="ghost" onClick={() => setStep("workout")}>
                  <ArrowLeft aria-hidden /> Back
                </Button>
                <Button variant="primary" disabled={!startAt} onClick={continueFromTime}>
                  {startAt ? `Continue with ${formatTime(new Date(startAt), tz)}` : "Choose a time"}
                  <ArrowRight aria-hidden />
                </Button>
              </StepFooter>
            </StepFrame>
          ) : null}

          {step === "time" && mode === "INSTANT" && category ? (
            <StepFrame
              headingRef={headingRef}
              title="Finding your earliest session"
              description={`${categoryLabel(category)} · a trainer who can start within the hour`}
            >
              {match.status === "loading" || match.status === "idle" ? (
                <div className="grid gap-3 rounded-lg border border-hairline bg-raised p-5" aria-busy="true">
                  <p className="flex items-center gap-2 text-body-sm text-ink-muted" role="status">
                    <Zap className="size-4 animate-pulse text-accent" aria-hidden /> Checking who&apos;s free
                    near {customer.zoneName}…
                  </p>
                  <Skeleton className="h-10 w-40" />
                  <Skeleton className="h-4 w-64" />
                </div>
              ) : match.status === "error" ? (
                match.error.code === "NO_TRAINER" ? (
                  <NoTrainer
                    title={match.error.message}
                    body={`Instant sessions need a trainer who is free from ${INSTANT_MIN_LEAD_MINUTES} to ${INSTANT_WINDOW_MINUTES} minutes from now. These scheduled times are open instead:`}
                    alternatives={match.error.alternatives ?? []}
                    tz={tz}
                    onPick={pickSuggestion}
                    extra={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          chooseMode("SCHEDULED");
                          enterTime(category, "SCHEDULED");
                        }}
                      >
                        <CalendarClock aria-hidden /> Choose another time
                      </Button>
                    }
                  />
                ) : (
                  <ErrorWithRetry error={match.error} onRetry={() => void loadInstant(category)} />
                )
              ) : (
                <InstantOffer match={match.data} tz={tz} onRetry={() => void loadInstant(category)} />
              )}
              <StepFooter>
                <Button type="button" variant="ghost" onClick={() => setStep("workout")}>
                  <ArrowLeft aria-hidden /> Back
                </Button>
                <Button variant="primary" disabled={match.status !== "ready"} onClick={continueFromTime}>
                  Choose trainer <ArrowRight aria-hidden />
                </Button>
              </StepFooter>
            </StepFrame>
          ) : null}

          {step === "trainer" && category ? (
            <StepFrame
              headingRef={headingRef}
              title="Your trainer"
              description={
                startAt
                  ? `${formatSlot(new Date(startAt), tz)} – ${formatTime(new Date(Date.parse(startAt) + SESSION_MINUTES * 60_000), tz)} · ${categoryLabel(category)}`
                  : undefined
              }
            >
              {match.status === "loading" || match.status === "idle" ? (
                <div className="grid gap-3" aria-busy="true" aria-label="Loading trainers">
                  <Skeleton className="h-28" />
                  <Skeleton className="h-28" />
                </div>
              ) : match.status === "error" ? (
                ["NO_TRAINER", "CONFLICT", "SLOT_TAKEN"].includes(match.error.code) ? (
                  <NoTrainer
                    title={match.error.message}
                    body="These nearby times are open:"
                    alternatives={match.error.alternatives ?? []}
                    tz={tz}
                    onPick={pickSuggestion}
                    extra={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => enterTime(category, mode ?? "SCHEDULED")}
                      >
                        Pick another time
                      </Button>
                    }
                  />
                ) : (
                  <ErrorWithRetry
                    error={match.error}
                    onRetry={() => startAt && void loadMatches(category, startAt, mode ?? "SCHEDULED")}
                  />
                )
              ) : (
                <TrainerPicker match={match.data} selected={trainerId} onSelect={setTrainerId} />
              )}
              <StepFooter>
                <Button type="button" variant="ghost" onClick={() => setStep("time")}>
                  <ArrowLeft aria-hidden /> Back
                </Button>
                <Button
                  variant="primary"
                  disabled={match.status !== "ready" || !trainerId}
                  onClick={() => {
                    setSubmitError(null);
                    setStep("review");
                  }}
                >
                  Review booking <ArrowRight aria-hidden />
                </Button>
              </StepFooter>
            </StepFrame>
          ) : null}

          {step === "review" && category && mode && startAt && match.status === "ready" ? (
            <StepFrame
              headingRef={headingRef}
              title="Review and confirm"
              description="Check the details. We confirm availability and the price again when you book."
            >
              <div className="grid gap-5">
                <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-hairline bg-raised p-5 sm:grid-cols-[auto_1fr]">
                  <ReviewRow label="Workout">{categoryLabel(category)}</ReviewRow>
                  <ReviewRow label="Session type">
                    {mode === "INSTANT" ? "Instant (starts within the hour)" : "Scheduled"}
                  </ReviewRow>
                  <ReviewRow label="Date">{formatDay(new Date(startAt), tz)}</ReviewRow>
                  <ReviewRow label="Time">
                    {formatTime(new Date(startAt), tz)} – {formatTime(new Date(match.data.endAt), tz)} IST
                  </ReviewRow>
                  <ReviewRow label="Duration">{SESSION_MINUTES} minutes</ReviewRow>
                  <ReviewRow label="Trainer">{selectedTrainer?.name ?? "—"}</ReviewRow>
                  <ReviewRow label="Where">
                    {customer.zoneName}
                    {customer.addressLine ? `, ${customer.addressLine}` : ""}
                  </ReviewRow>
                  {notes ? <ReviewRow label="Your note">{notes}</ReviewRow> : null}
                </dl>

                <div className="rounded-lg border border-hairline bg-raised p-5">
                  <h3 className="mb-3 font-semibold">Price</h3>
                  <PriceBreakdown price={match.data.quote} />
                  <p className="mt-3 text-body-sm text-ink-subtle">
                    Calculated by Zuryo from the current pricing rules and saved with your booking. The
                    commission goes to your community; the session price goes to Zuryo and your trainer.
                  </p>
                </div>

                <div className="rounded-lg border border-hairline bg-raised p-5">
                  <PaymentChoice
                    packages={packages}
                    startAt={startAt}
                    total={match.data.quote.totalAmount}
                    value={payment}
                    onChange={(v) => {
                      setPaymentChoice(v);
                      setSubmitError(null);
                    }}
                    tz={tz}
                  />
                </div>

                {submitError ? (
                  <SubmitProblem
                    error={submitError}
                    tz={tz}
                    onPick={pickSuggestion}
                    onOtherTrainer={() => {
                      setStep("trainer");
                      void loadMatches(category, startAt, mode);
                    }}
                    onNewInstant={() => enterTime(category, "INSTANT")}
                    mode={mode}
                  />
                ) : null}
              </div>
              <StepFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep("trainer")}
                  disabled={submitting}
                >
                  <ArrowLeft aria-hidden /> Back
                </Button>
                <Button
                  variant={mode === "INSTANT" ? "instant" : "primary"}
                  size="lg"
                  loading={submitting}
                  onClick={() => void confirm()}
                >
                  {submitting
                    ? "Booking…"
                    : payment.method === "PACKAGE"
                      ? "Confirm with package session"
                      : `Confirm and pay ${formatINR(match.data.quote.totalAmount)}`}
                </Button>
              </StepFooter>
            </StepFrame>
          ) : null}
        </section>
      </div>

      <aside className="hidden xl:block" aria-label="Booking summary">
        <div className="sticky top-10 grid gap-4 rounded-lg border border-hairline bg-raised p-5">
          <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
            Your session
          </p>
          <dl className="grid gap-3 text-body-sm">
            <SummaryRow label="Type" value={mode ? (mode === "INSTANT" ? "Instant" : "Scheduled") : null} />
            <SummaryRow label="Workout" value={category ? categoryLabel(category) : null} />
            <SummaryRow
              label="When"
              value={startAt ? `${formatSlot(new Date(startAt), tz)} · ${SESSION_MINUTES} min` : null}
            />
            <SummaryRow label="Trainer" value={selectedTrainer?.name ?? null} />
          </dl>
          <div className="flex items-center gap-2 border-t border-hairline pt-3 text-body-sm text-ink-muted">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{customer.zoneName}</span>
          </div>
          {quote && startAt ? (
            <div className="flex items-baseline justify-between border-t border-hairline pt-3">
              <span className="text-body-sm text-ink-muted">{quote.isPeak ? "Peak total" : "Total"}</span>
              <span className="text-heading-md font-semibold tabular">{formatINR(quote.totalAmount)}</span>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function StepFrame({
  headingRef,
  title,
  description,
  children,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6">
      <header>
        <h2
          id="step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-display-md focus:outline-none"
        >
          {title}
        </h2>
        {description ? <p className="mt-1 text-ink-muted">{description}</p> : null}
      </header>
      {children}
    </div>
  );
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
      {children}
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-body-sm text-ink-muted sm:pt-0.5">{label}</dt>
      <dd className="-mt-2 font-semibold break-words sm:mt-0">{children}</dd>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={value ? "font-semibold" : "text-ink-subtle"}>{value ?? "Not chosen yet"}</dd>
    </div>
  );
}

function SlotsSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading available times">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] w-[4.75rem] shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

function ErrorWithRetry({ error, onRetry }: { error: ServiceError; onRetry: () => void }) {
  return (
    <div className="grid gap-3">
      <Notice tone="danger" live>
        {error.message}
      </Notice>
      <div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    </div>
  );
}

function SuggestionButtons({
  alternatives,
  tz,
  onPick,
}: {
  alternatives: SlotSuggestion[];
  tz: string;
  onPick: (s: SlotSuggestion) => void;
}) {
  if (alternatives.length === 0) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {alternatives.map((a) => (
        <li key={a.startAt}>
          <button
            type="button"
            onClick={() => onPick(a)}
            className="grid w-full gap-0.5 rounded-md border border-hairline bg-raised px-3 py-2.5 text-left hover:border-brand"
          >
            <span className="font-semibold">{formatSlot(new Date(a.startAt), tz)}</span>
            <span className="text-body-sm text-ink-muted tabular">
              {a.isPeak ? "Peak · " : ""}
              {formatINR(a.totalAmount)} · {a.trainerCount} trainer{a.trainerCount === 1 ? "" : "s"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NoTrainer({
  title,
  body,
  alternatives,
  tz,
  onPick,
  extra,
}: {
  title: string;
  body: string;
  alternatives: SlotSuggestion[];
  tz: string;
  onPick: (s: SlotSuggestion) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 rounded-lg border border-dashed border-control bg-raised p-5" role="status">
      <div className="flex gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-ink-muted"
          aria-hidden
        >
          <SearchX className="size-5" />
        </span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-body-sm text-ink-muted">
            {alternatives.length > 0
              ? body
              : "There are no open times in the next few days for this workout."}
          </p>
        </div>
      </div>
      <SuggestionButtons alternatives={alternatives} tz={tz} onPick={onPick} />
      {extra ? <div>{extra}</div> : null}
    </div>
  );
}

function minutesUntil(iso: string) {
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000));
}

function InstantOffer({ match, tz, onRetry }: { match: MatchResult; tz: string; onRetry: () => void }) {
  const start = new Date(match.startAt);
  const [minutes, setMinutes] = useState(() => minutesUntil(match.startAt));
  useEffect(() => {
    setMinutes(minutesUntil(match.startAt));
    const t = setInterval(() => setMinutes(minutesUntil(match.startAt)), 30_000);
    return () => clearInterval(t);
  }, [match.startAt]);
  return (
    <div className="grid gap-4 rounded-lg border border-hairline bg-raised p-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="flex items-center gap-2 text-body-sm font-semibold text-accent-text">
          <Zap className="size-4" aria-hidden /> Earliest start
        </p>
        <p className="mt-1 text-numeric-lg font-semibold tracking-tight tabular">{formatTime(start, tz)}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden /> in about {minutes} min
          </span>
          <span>
            {match.trainers.length} trainer{match.trainers.length === 1 ? "" : "s"} can make it
          </span>
          {match.trainers[0]?.travel ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" aria-hidden /> nearest is{" "}
              {match.trainers[0].travel.roadKm.toFixed(1)} km away
            </span>
          ) : null}
          <span className="tabular">
            {match.quote.isPeak ? "Peak · " : ""}
            {formatINR(match.quote.totalAmount)}
          </span>
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        <RotateCcw aria-hidden /> Search again
      </Button>
    </div>
  );
}

function SubmitProblem({
  error,
  tz,
  mode,
  onPick,
  onOtherTrainer,
  onNewInstant,
}: {
  error: ServiceError;
  tz: string;
  mode: BookingMode;
  onPick: (s: SlotSuggestion) => void;
  onOtherTrainer: () => void;
  onNewInstant: () => void;
}) {
  const instantExpired = mode === "INSTANT" && error.code === "VALIDATION" && !!error.fieldErrors?.startAt;
  return (
    <div className="grid gap-3">
      <Notice
        tone={error.code === "PRICE_CHANGED" ? "warning" : "danger"}
        title={
          error.code === "PRICE_CHANGED"
            ? "The price changed"
            : error.code === "PAYMENT_FAILED"
              ? "Payment declined (demo)"
              : "We couldn't book this session"
        }
        live
      >
        {error.message}
        {error.code === "INTERNAL" || error.code === "UNAVAILABLE" ? " Nothing was booked." : ""}
      </Notice>
      {error.code === "SLOT_TAKEN" || error.code === "NO_TRAINER" ? (
        <div>
          <Button variant="secondary" size="sm" onClick={onOtherTrainer}>
            See who else is free at this time
          </Button>
        </div>
      ) : null}
      {instantExpired ? (
        <div>
          <Button variant="secondary" size="sm" onClick={onNewInstant}>
            <Zap aria-hidden /> Find a new instant slot
          </Button>
        </div>
      ) : null}
      {error.alternatives && error.alternatives.length > 0 ? (
        <>
          <p className="text-body-sm text-ink-muted">Or choose one of these open times:</p>
          <SuggestionButtons alternatives={error.alternatives} tz={tz} onPick={onPick} />
        </>
      ) : null}
    </div>
  );
}

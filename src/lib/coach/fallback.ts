import type { CoachContext } from "./context";
import type { CoachTopic } from "./scope";

/**
 * Rule-based replies used when no AI provider answers. Deterministic, grounded only in the
 * customer's own data, and always labelled "Rule-based" in the UI. Kept general on purpose: they
 * point to the app's personalised features rather than pretending to be the AI coach.
 */
export function ruleBasedCoachReply(
  topic: Exclude<CoachTopic, "MEDICAL" | "OUT_OF_SCOPE">,
  c: CoachContext,
): string {
  switch (topic) {
    case "MY_ZURYOFIT":
      return [
        c.nextSession
          ? c.nextSession.status === "IN_PROGRESS"
            ? `Your ${c.nextSession.category.toLowerCase()} session is in progress right now.`
            : `Your next session is ${c.nextSession.when}: ${c.nextSession.category.toLowerCase()}${
                c.nextSession.trainerFirstName ? ` with ${c.nextSession.trainerFirstName}` : ""
              }.`
          : "You don't have a session booked right now.",
        c.pkg
          ? `Your ${c.pkg.name} has ${c.pkg.remaining} of ${c.pkg.total} sessions left${c.pkg.validUntil ? ` (valid until ${c.pkg.validUntil})` : ""}.`
          : "You don't have an active package, so each session is paid for when you book.",
        `You've completed ${c.completedCount} session${c.completedCount === 1 ? "" : "s"} so far.`,
        'To book, use "Book a session". To move or cancel a booking, open "My bookings".',
      ].join(" ");
    case "WORKOUT": {
      const gear = c.equipment.filter((e) => e !== "No equipment");
      return [
        `A simple structure for a ${c.level?.toLowerCase() ?? "beginner"} session:`,
        "- 5–8 minutes of warm-up: brisk walk, arm circles, hip circles, bodyweight squats",
        `- 3–4 exercises for 2–3 sets each${gear.length ? `, using your ${gear.join(", ").toLowerCase()}` : " with bodyweight"}: a squat or lunge, a push (wall or knee push-ups), a pull or hinge, and a plank`,
        "- Rest 45–90 seconds between sets and stop well before your form breaks down",
        '- 5 minutes of easy stretching to finish. For a plan built from your profile and sessions, tap "Generate workout" on the Fitness page.',
      ].join("\n");
    }
    case "RECOVERY":
      return [
        "Some general recovery basics:",
        "- Light movement such as an easy walk or gentle mobility on the day after a hard session",
        "- 7–9 hours of sleep, and water through the day",
        "- Mild soreness for a day or two is normal; ease off rather than training through it",
        "- Sharp, worsening or lasting pain is different: stop and check with a physiotherapist.",
      ].join("\n");
    case "NUTRITION":
      return [
        "General, everyday basics (not a diet plan):",
        "- Include a protein source at each meal, such as dal, paneer, eggs, curd or tofu",
        "- Drink water before and after your session",
        "- A light snack with some carbohydrate 60–90 minutes before training can help energy",
        "For a plan around a health condition, please talk to a doctor or a registered dietitian.",
      ].join("\n");
    case "HABITS":
      return [
        "What tends to help consistency:",
        "- Pick two or three fixed slots a week and book them in advance",
        "- Start smaller than you think, and track a simple streak",
        "- Plan for busy days with a 15-minute fallback routine",
        c.nextSession
          ? `Your next session is ${c.nextSession.when}, which is a good anchor for the week.`
          : 'Booking your next session now, under "Book a session", is a good first step.',
      ].join("\n");
  }
}

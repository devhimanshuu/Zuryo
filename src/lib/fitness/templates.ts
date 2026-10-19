import type { EquipmentOption, FitnessGoal, FitnessLevel, WorkoutCategory } from "@/lib/validation/enums";
import type { RecommendationContext } from "./context";
import type { RecommendationOutput } from "./recommendation-schema";

/**
 * Deterministic rule-based workout templates. The same inputs always produce the same output, so
 * the fallback is testable and reproducible. Every template is validated by
 * `recommendationOutputSchema` at construction time in the tests.
 *
 * The output is honestly labelled RULE_BASED when stored; it is never presented as AI-generated.
 */

type Exercise =
  | { kind: "REPS"; name: string; sets: number; reps: number; cue?: string }
  | { kind: "TIMED"; name: string; durationMin: number; cue?: string };

type Template = {
  category: WorkoutCategory;
  durationMinutes: number;
  title: string;
  summary: string;
  warmup: string;
  cooldown: string;
  rest: string;
  equipmentRequired: EquipmentOption[]; // what the main list needs
  exercises: Exercise[];
  bodyweight: Exercise[]; // variant used when the customer lacks the required equipment
};

const reps = (name: string, sets: number, r: number, cue?: string): Exercise => ({ kind: "REPS", name, sets, reps: r, cue });
const timed = (name: string, durationMin: number, cue?: string): Exercise => ({ kind: "TIMED", name, durationMin, cue });

const GLOBAL_SAFETY =
  "Stop any exercise that causes sharp pain, dizziness, chest pain or unusual breathlessness, and speak to a qualified professional. This is a general workout suggestion, not medical advice, and not a substitute for a trainer watching your form.";

const TEMPLATES: Record<FitnessGoal, Template> = {
  STRENGTH: {
    category: "STRENGTH",
    durationMinutes: 40,
    title: "Full-body strength foundations",
    summary: "A balanced strength session covering squat, push, pull and core patterns.",
    warmup: "5 minutes of marching in place, arm circles and 10 slow bodyweight squats.",
    cooldown: "3–5 minutes of gentle stretching for the quads, chest and back.",
    rest: "Rest 60–90 seconds between sets; keep the last two reps of each set controlled.",
    equipmentRequired: ["DUMBBELLS"],
    exercises: [
      reps("Goblet squat", 3, 12, "Keep your chest tall and heels down."),
      reps("Dumbbell floor press", 3, 10, "Lower with control until your elbows touch the floor."),
      reps("Bent-over dumbbell row", 3, 10, "Hinge at the hips with a flat back."),
      reps("Glute bridge", 3, 15, "Squeeze your glutes at the top."),
      timed("Dead bug", 2, "Slow opposite arm and leg reaches."),
    ],
    bodyweight: [
      reps("Bodyweight squat", 3, 12, "Sit back as if reaching for a chair."),
      reps("Incline push-up", 3, 8, "Hands on a sturdy table or bench."),
      reps("Doorway row", 3, 10, "Grip the frame and pull your chest towards it."),
      reps("Glute bridge", 3, 15, "Squeeze your glutes at the top."),
      timed("Dead bug", 2, "Slow opposite arm and leg reaches."),
    ],
  },
  MOBILITY: {
    category: "MOBILITY",
    durationMinutes: 30,
    title: "Whole-body mobility flow",
    summary: "Slow, controlled movement through the hips, spine and shoulders.",
    warmup: "2–3 minutes of easy walking or marching to raise your temperature.",
    cooldown: "2 minutes of relaxed breathing while lying flat.",
    rest: "Move continuously but never force a position; breathe evenly throughout.",
    equipmentRequired: ["MAT"],
    exercises: [
      timed("Cat-cow", 2, "Move through the full spine, one vertebra at a time."),
      timed("World's greatest stretch", 3, "Alternate sides every 30 seconds."),
      timed("90/90 hip switches", 3, "Keep the movement slow and controlled."),
      timed("Deep squat hold", 2, "Hold a supported position, elbows inside knees."),
      timed("Wall slides", 2, "Keep your lower back in light contact with the wall."),
    ],
    bodyweight: [
      timed("Standing cat-cow", 2, "Hands on thighs, round and arch the spine slowly."),
      timed("Standing hip circles", 3, "Alternate directions, keep the movement smooth."),
      timed("Chair sit-to-stand", 3, "Lower slowly and stand with control."),
      timed("Doorway chest stretch", 2, "Forearms on the frame, step gently through."),
      timed("Standing wall slides", 2, "Back against the wall, slide arms up and down."),
    ],
  },
  ENDURANCE: {
    category: "CARDIO",
    durationMinutes: 35,
    title: "Steady cardio with short intervals",
    summary: "A manageable cardio session that builds endurance without demanding experience.",
    warmup: "5 minutes of easy walking with gradually increasing pace.",
    cooldown: "3 minutes of slow walking until your breathing settles.",
    rest: "Recover fully between intervals; talk-test: you should be able to speak a sentence.",
    equipmentRequired: ["SKIPPING_ROPE"],
    exercises: [
      timed("Brisk walk", 6, "Arms swinging, purposeful stride."),
      timed("Jump rope intervals", 3, "30 seconds on, 30 seconds rest."),
      timed("Brisk walk", 6, "Pick the pace back up."),
      timed("Step-ups on a low step", 4, "Alternate legs, steady rhythm."),
      timed("Jump rope intervals", 3, "30 seconds on, 30 seconds rest."),
    ],
    bodyweight: [
      timed("Brisk walk", 8, "Arms swinging, purposeful stride."),
      timed("March in place with high knees", 3, "Drive the knees, keep the pace honest."),
      timed("Brisk walk", 8, "Pick the pace back up."),
      timed("Step-ups on a low step", 4, "Alternate legs, steady rhythm."),
      timed("Shadow boxing", 3, "Light punches, stay on the balls of your feet."),
    ],
  },
  WEIGHT_LOSS: {
    category: "FUNCTIONAL",
    durationMinutes: 40,
    title: "Full-body calorie-burning circuit",
    summary: "A circuit of compound movements that keeps the heart rate up safely.",
    warmup: "5 minutes of marching, arm swings and 10 slow squats.",
    cooldown: "3–5 minutes of stretching the legs, hips and back.",
    rest: "Rest 30–45 seconds between exercises; one minute between rounds.",
    equipmentRequired: ["RESISTANCE_BAND"],
    exercises: [
      reps("Bodyweight squat", 3, 15, "Full range, controlled tempo."),
      reps("Band pull-apart", 3, 12, "Squeeze the shoulder blades together."),
      reps("Reverse lunge", 3, 10, "Alternate legs, keep the front knee stable."),
      reps("Push-up (on knees if needed)", 3, 8, "Lower until your chest is a fist's height from the floor."),
      timed("Fast walk or march", 3, "Work hard enough that talking is possible, not easy."),
    ],
    bodyweight: [
      reps("Bodyweight squat", 3, 15, "Full range, controlled tempo."),
      reps("Arm circles (large)", 3, 20, "Both directions, steady rhythm."),
      reps("Reverse lunge", 3, 10, "Alternate legs, keep the front knee stable."),
      reps("Push-up (on knees if needed)", 3, 8, "Lower until your chest is a fist's height from the floor."),
      timed("Fast walk or march", 3, "Work hard enough that talking is possible, not easy."),
    ],
  },
  POSTURE: {
    category: "MOBILITY",
    durationMinutes: 30,
    title: "Posture reset routine",
    summary: "Opens the chest, strengthens the upper back and wakes up the core.",
    warmup: "2–3 minutes of shoulder rolls and gentle neck circles.",
    cooldown: "2 minutes of lying flat with arms out to the sides.",
    rest: "Little rest between movements; keep everything slow and deliberate.",
    equipmentRequired: ["RESISTANCE_BAND"],
    exercises: [
      reps("Band pull-apart", 3, 12, "Squeeze the shoulder blades together."),
      reps("Chin tucks", 3, 10, "Draw the head straight back, not down."),
      timed("Wall angel", 2, "Keep elbows and wrists against the wall if possible."),
      reps("Glute bridge", 3, 12, "Posterior tilt first, then lift."),
      timed("Cat-cow", 2, "Move slowly through the spine."),
    ],
    bodyweight: [
      reps("Prone Y raise", 3, 10, "Thumbs up, lift with the upper back."),
      reps("Chin tucks", 3, 10, "Draw the head straight back, not down."),
      timed("Wall angel", 2, "Keep elbows and wrists against the wall if possible."),
      reps("Glute bridge", 3, 12, "Posterior tilt first, then lift."),
      timed("Cat-cow", 2, "Move slowly through the spine."),
    ],
  },
  GENERAL_FITNESS: {
    category: "FUNCTIONAL",
    durationMinutes: 40,
    title: "Everyday fitness starter",
    summary: "A well-rounded session mixing strength, mobility and a little cardio.",
    warmup: "5 minutes of marching, arm circles and gentle squats.",
    cooldown: "3–5 minutes of stretching the main muscles you used.",
    rest: "Rest 45–60 seconds between exercises.",
    equipmentRequired: ["DUMBBELLS"],
    exercises: [
      reps("Goblet squat", 3, 12, "Chest tall, heels down."),
      reps("Dumbbell overhead press", 3, 10, "Press without arching the lower back."),
      reps("Dumbbell row", 3, 10, "Flat back, pull to the hip."),
      timed("Marching in place", 3, "Swing the arms, drive the knees."),
      timed("Plank", 2, "Hips level, breathe steadily."),
    ],
    bodyweight: [
      reps("Bodyweight squat", 3, 15, "Chest tall, heels down."),
      reps("Incline push-up", 3, 10, "Hands on a sturdy table or bench."),
      reps("Doorway row", 3, 10, "Grip the frame, pull your chest towards it."),
      timed("Marching in place", 3, "Swing the arms, drive the knees."),
      timed("Plank", 2, "Hips level, breathe steadily."),
    ],
  },
  CONSISTENCY: {
    category: "FUNCTIONAL",
    durationMinutes: 25,
    title: "Habit-forming 25 minutes",
    summary: "A short, repeatable session designed to be easy to show up for.",
    warmup: "3 minutes of marching and joint circles.",
    cooldown: "2 minutes of easy stretching.",
    rest: "Keep rests short: 30 seconds between exercises.",
    equipmentRequired: [],
    exercises: [
      reps("Bodyweight squat", 2, 12, "Slow and controlled."),
      reps("Incline push-up", 2, 8, "Sturdy table or bench."),
      reps("Glute bridge", 2, 12, "Squeeze at the top."),
      timed("Brisk walk or march", 5, "Enough to raise your breathing slightly."),
    ],
    bodyweight: [
      reps("Bodyweight squat", 2, 12, "Slow and controlled."),
      reps("Incline push-up", 2, 8, "Sturdy table or bench."),
      reps("Glute bridge", 2, 12, "Squeeze at the top."),
      timed("Brisk walk or march", 5, "Enough to raise your breathing slightly."),
    ],
  },
  BALANCE: {
    category: "MOBILITY",
    durationMinutes: 30,
    title: "Balance and movement control",
    summary: "Slow, deliberate drills that train stability and body awareness.",
    warmup: "3 minutes of marching and ankle circles.",
    cooldown: "2 minutes of calf and hamstring stretching.",
    rest: "Rest as needed; quality of position matters more than speed.",
    equipmentRequired: [],
    exercises: [
      timed("Single-leg balance", 2, "Stand near a wall, alternate sides."),
      reps("Heel-to-toe walk", 3, 10, "Walk a straight line, eyes forward."),
      reps("Sit-to-stand", 3, 8, "Lower slowly without using your hands."),
      timed("Tandem stance with head turns", 2, "Turn the head slowly side to side."),
      timed("Marching with pauses", 3, "Pause for two seconds at the top of each step."),
    ],
    bodyweight: [
      timed("Single-leg balance", 2, "Stand near a wall, alternate sides."),
      reps("Heel-to-toe walk", 3, 10, "Walk a straight line, eyes forward."),
      reps("Sit-to-stand", 3, 8, "Lower slowly without using your hands."),
      timed("Tandem stance with head turns", 2, "Turn the head slowly side to side."),
      timed("Marching with pauses", 3, "Pause for two seconds at the top of each step."),
    ],
  },
};

const GOAL_LABEL: Record<FitnessGoal, string> = {
  WEIGHT_LOSS: "weight loss",
  STRENGTH: "strength",
  MOBILITY: "mobility and flexibility",
  ENDURANCE: "cardiovascular endurance",
  POSTURE: "posture",
  GENERAL_FITNESS: "general fitness",
  CONSISTENCY: "a consistent workout routine",
  BALANCE: "balance and movement control",
};

const LEVEL_LABEL: Record<FitnessLevel, string> = {
  BEGINNER: "beginner",
  INTERMEDIATE: "intermediate",
  ADVANCED: "advanced",
};

export function goalLabel(goal: FitnessGoal): string {
  return GOAL_LABEL[goal];
}

function intensityFor(level: FitnessLevel | null, hasLimitations: boolean): RecommendationOutput["intensity"] {
  const base = level === "INTERMEDIATE" ? "MODERATE" : level === "ADVANCED" ? "HIGH" : "LOW";
  if (hasLimitations && base !== "LOW") return "MODERATE";
  if (hasLimitations) return "LOW";
  return base;
}

/** Adapts the plan to the customer's stated experience: beginners get gentler volume. Always
 * returns copies so callers can never mutate the shared templates. */
function scaleFor(level: FitnessLevel | null, exercises: Exercise[]): Exercise[] {
  return exercises.map((e) => {
    if (level === "BEGINNER" || level === null) {
      if (e.kind !== "REPS") return { ...e };
      return { ...e, sets: Math.max(2, e.sets - 1), reps: Math.max(6, Math.min(15, e.reps)) };
    }
    return { ...e };
  });
}

/**
 * The deterministic fallback. Every part of the output is derived from the actual context:
 * the goal picks the template, the level scales it, stated limitations lower the intensity, and
 * the explanation only mentions facts that are really in the context.
 */
export function buildRuleBasedRecommendation(ctx: RecommendationContext): RecommendationOutput {
  const template = TEMPLATES[ctx.goal];
  const hasEquipment = template.equipmentRequired.every((r) => ctx.equipment.includes(r));
  const exercises = scaleFor(ctx.level, hasEquipment ? template.exercises : template.bodyweight);
  const hasLimitations = !!ctx.movementLimitations?.trim() || !!ctx.accommodations?.trim();

  return {
    title: template.title,
    summary: template.summary,
    category: template.category,
    durationMinutes: template.durationMinutes,
    intensity: intensityFor(ctx.level, hasLimitations),
    goal: ctx.goal,
    warmup: template.warmup,
    cooldown: template.cooldown,
    rest: template.rest,
    safety: GLOBAL_SAFETY,
    adaptations: hasLimitations
      ? "Every exercise can be done seated or with support nearby. Reduce the range, sets or pace as needed."
      : "Short on time? Keep the first three exercises and skip the rest — consistency beats volume.",
    nextAction: `Book a ${template.category} session with a trainer in your community to work through this plan with guidance.`,
    equipment: template.equipmentRequired,
    exercises,
  };
}

/** The grounded, honest explanation stored with the recommendation. */
export function ruleBasedExplanation(ctx: RecommendationContext): string {
  const levelPhrase = ctx.level ? LEVEL_LABEL[ctx.level] : "beginner (assumed)";
  const equipmentPhrase = ctx.equipment.length
    ? ` with ${ctx.equipment.map((e) => e.replaceAll("_", " ").toLowerCase()).join(", ")}`
    : " with equipment-free exercises";
  const limitationPhrase =
    ctx.movementLimitations || ctx.accommodations ? " and adjusted for the limitations you shared" : "";
  return `Suggested because you selected ${GOAL_LABEL[ctx.goal]} at ${levelPhrase} level, prefer ${equipmentPhrase}${limitationPhrase}.`;
}

import { WORKOUT_CATEGORIES, type WorkoutCategory } from "@/lib/validation/enums";

/** Customer-facing copy for each workout category. Descriptions are generic, not claims. */
export const WORKOUT_CATEGORY_INFO: Record<WorkoutCategory, { label: string; description: string }> = {
  STRENGTH: {
    label: "Strength training",
    description: "Build strength with weights, bands or bodyweight.",
  },
  YOGA: {
    label: "Yoga",
    description: "Breath-led flows for flexibility, balance and calm.",
  },
  CARDIO: {
    label: "Cardio",
    description: "Raise your heart rate with intervals and conditioning.",
  },
  FUNCTIONAL: {
    label: "Functional training",
    description: "Everyday movement patterns: squat, hinge, push, pull, carry.",
  },
  MOBILITY: {
    label: "Mobility & flexibility",
    description: "Ease stiffness and improve your range of motion.",
  },
};

export function categoryLabel(category: WorkoutCategory | null | undefined): string {
  return category ? WORKOUT_CATEGORY_INFO[category].label : "General session";
}

export { WORKOUT_CATEGORIES };

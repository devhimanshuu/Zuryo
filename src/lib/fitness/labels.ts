import type {
  EquipmentOption,
  FitnessGoal,
  WorkoutEnvironment,
  WorkoutIntensity,
  WorkoutPreference,
} from "@/lib/validation/enums";

/** Human labels for the fitness domain enums. */

export const GOAL_LABELS: Record<FitnessGoal, string> = {
  WEIGHT_LOSS: "Weight loss",
  STRENGTH: "Strength",
  MOBILITY: "Mobility & flexibility",
  ENDURANCE: "Cardio endurance",
  POSTURE: "Posture",
  GENERAL_FITNESS: "General fitness",
  CONSISTENCY: "Consistent routine",
  BALANCE: "Balance & control",
};

export const INTENSITY_LABELS: Record<WorkoutIntensity, string> = {
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
};

export const ENVIRONMENT_LABELS: Record<WorkoutEnvironment, string> = {
  HOME: "Home",
  OUTDOOR: "Outdoor",
};

export const EQUIPMENT_LABELS: Record<EquipmentOption, string> = {
  NONE: "No equipment",
  MAT: "Yoga mat",
  DUMBBELLS: "Dumbbells",
  RESISTANCE_BAND: "Resistance band",
  KETTLEBELL: "Kettlebell",
  SKIPPING_ROPE: "Skipping rope",
  STATIONARY_BIKE: "Stationary bike",
};

export const PREFERENCE_LABELS: Record<WorkoutPreference, string> = {
  MORNING: "Mornings",
  EVENING: "Evenings",
  LOW_IMPACT: "Low impact",
  HIGH_INTENSITY: "High intensity",
  YOGA: "Yoga",
  BODYWEIGHT: "Bodyweight",
  WEIGHTS: "Weights",
  OUTDOOR: "Outdoors",
};

export const goalLabel = (g: FitnessGoal) => GOAL_LABELS[g];
export const intensityLabel = (i: WorkoutIntensity) => INTENSITY_LABELS[i];
export const environmentLabel = (e: WorkoutEnvironment) => ENVIRONMENT_LABELS[e];
export const equipmentLabel = (e: EquipmentOption) => EQUIPMENT_LABELS[e];

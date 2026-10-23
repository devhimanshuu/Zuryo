import { z } from "zod";

/**
 * Domain enums as plain constants so client components and validation can use them without
 * importing the Prisma client. tests/schema.test.ts asserts they stay identical to schema.prisma.
 */
export const ROLES = ["CUSTOMER", "TRAINER", "OPERATIONS"] as const;
export const BOOKING_MODES = ["INSTANT", "SCHEDULED"] as const;
export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;
export const FITNESS_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const FITNESS_GOALS = [
  "WEIGHT_LOSS",
  "STRENGTH",
  "MOBILITY",
  "ENDURANCE",
  "POSTURE",
  "GENERAL_FITNESS",
  "CONSISTENCY",
  "BALANCE",
] as const;
export const WORKOUT_INTENSITIES = ["LOW", "MODERATE", "HIGH"] as const;
export const WORKOUT_ENVIRONMENTS = ["HOME", "OUTDOOR"] as const;
export const EQUIPMENT_OPTIONS = [
  "NONE",
  "MAT",
  "DUMBBELLS",
  "RESISTANCE_BAND",
  "KETTLEBELL",
  "SKIPPING_ROPE",
  "STATIONARY_BIKE",
] as const;
export const WORKOUT_PREFERENCES = [
  "MORNING",
  "EVENING",
  "LOW_IMPACT",
  "HIGH_INTENSITY",
  "YOGA",
  "BODYWEIGHT",
  "WEIGHTS",
  "OUTDOOR",
] as const;
export const PRICING_KINDS = ["NORMAL", "PEAK"] as const;
export const WORKOUT_CATEGORIES = ["STRENGTH", "YOGA", "CARDIO", "FUNCTIONAL", "MOBILITY"] as const;
export const AVAILABILITY_STATUSES = ["AVAILABLE", "BLOCKED"] as const;

export const roleSchema = z.enum(ROLES);
export const bookingModeSchema = z.enum(BOOKING_MODES);
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export const fitnessLevelSchema = z.enum(FITNESS_LEVELS);
export const fitnessGoalSchema = z.enum(FITNESS_GOALS);
export const workoutIntensitySchema = z.enum(WORKOUT_INTENSITIES, { error: "Choose an intensity" });
export const workoutEnvironmentSchema = z.enum(WORKOUT_ENVIRONMENTS);
export const equipmentOptionSchema = z.enum(EQUIPMENT_OPTIONS);
export const workoutPreferenceSchema = z.enum(WORKOUT_PREFERENCES);
export const pricingKindSchema = z.enum(PRICING_KINDS);
export const workoutCategorySchema = z.enum(WORKOUT_CATEGORIES, { error: "Choose a workout type" });
export const availabilityStatusSchema = z.enum(AVAILABILITY_STATUSES);

export type Role = z.infer<typeof roleSchema>;
export type BookingMode = z.infer<typeof bookingModeSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type WorkoutCategory = z.infer<typeof workoutCategorySchema>;
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;
export type FitnessLevel = z.infer<typeof fitnessLevelSchema>;
export type FitnessGoal = z.infer<typeof fitnessGoalSchema>;
export type WorkoutPreference = z.infer<typeof workoutPreferenceSchema>;
export type WorkoutIntensity = z.infer<typeof workoutIntensitySchema>;
export type WorkoutEnvironment = z.infer<typeof workoutEnvironmentSchema>;
export type EquipmentOption = z.infer<typeof equipmentOptionSchema>;

export const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: "/customer",
  TRAINER: "/trainer",
  OPERATIONS: "/operations",
};

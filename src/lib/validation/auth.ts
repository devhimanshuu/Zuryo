import { z } from "zod";
import { WORKOUT_CATEGORIES } from "./enums";

export const PASSWORD_RULES = { min: 8, max: 72 } as const; // bcrypt ignores bytes past 72

/** Roles anyone may register as. Operators are only ever created by Zuryo staff. */
export const SIGN_UP_ROLES = ["CUSTOMER", "TRAINER"] as const;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_RULES.min, `Use at least ${PASSWORD_RULES.min} characters`)
  .max(PASSWORD_RULES.max, `Use at most ${PASSWORD_RULES.max} characters`)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(80, "Name must be under 80 characters");

const identity = {
  name: nameSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email is too long")
    .pipe(z.email("Enter a valid email address")),
  password: newPasswordSchema,
};

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{10,16}$/, "Enter a valid phone number")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Fields every new account needs beyond who they are. */
const placement = {
  phone: phoneSchema,
  serviceZoneId: z.string().min(1, "Choose your community"),
};

export const trainerExtras = {
  workoutCategories: z
    .array(z.enum(WORKOUT_CATEGORIES))
    .min(1, "Pick at least one workout type")
    .max(WORKOUT_CATEGORIES.length),
  experienceYears: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce
      .number({ error: "Experience must be a number" })
      .int("Use whole years")
      .min(0, "Experience can't be negative")
      .max(60, "Enter a realistic number of years")
      .optional(),
  ),
  bio: optionalText(400, "Keep your bio under 400 characters"),
};

/** The form submits one shape; the role decides which extra fields are required. */
export const signUpSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("CUSTOMER"), ...identity, ...placement }),
  z.object({ role: z.literal("TRAINER"), ...identity, ...placement, ...trainerExtras }),
]);

/**
 * Finishing a Google sign-up: name and email come from the verified Google session on the server
 * and there is no password, so only the role and its details are submitted.
 */
export const completeGoogleSignUpSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("CUSTOMER"), ...placement }),
  z.object({ role: z.literal("TRAINER"), ...placement, ...trainerExtras }),
]);

export type SignUpInput = z.infer<typeof signUpSchema>;
export type CompleteGoogleSignUpInput = z.infer<typeof completeGoogleSignUpSchema>;

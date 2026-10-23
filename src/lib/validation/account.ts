import { z } from "zod";
import { newPasswordSchema, nameSchema, phoneSchema, trainerExtras } from "./auth";

/** Editable profile details. Email is deliberately absent: it is the sign-in identity (and the
 * Google match key), so changing it would be an account takeover vector. */
export const profileSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("CUSTOMER"), name: nameSchema, phone: phoneSchema }),
  z.object({ role: z.literal("OPERATIONS"), name: nameSchema, phone: phoneSchema }),
  z.object({ role: z.literal("TRAINER"), name: nameSchema, phone: phoneSchema, ...trainerExtras }),
]);

/**
 * Setting or changing the password. `currentPassword` is the proof for anyone who already has one;
 * a Google-only account (or a forgotten password) is instead proved by a fresh Google sign-in,
 * which the server checks from the session, never from this input.
 */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().max(200).optional(),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords don't match",
  });

export type ProfileInput = z.infer<typeof profileSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

/** A Google sign-in older than this can't authorise a password change. */
export const FRESH_AUTH_WINDOW_MS = 10 * 60 * 1000;

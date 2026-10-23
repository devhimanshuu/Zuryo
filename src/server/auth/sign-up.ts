import "server-only";
import { hash } from "bcryptjs";
import type { Db } from "@/lib/db";
import type { Role } from "@/lib/validation/enums";
import { completeGoogleSignUpSchema, signUpSchema } from "@/lib/validation/auth";
import { fail, isUniqueViolationOn, ok, type ServiceResult } from "@/server/booking/errors";

/**
 * Self-service sign-up for customers and trainers: one User and its role profile in a single
 * nested write, so a half-created account can't exist. The role comes from a closed schema (never
 * OPERATIONS) and the account is always ACTIVE with the profile the role needs. A new trainer has
 * no availability yet, so nobody is matched to them until they publish some.
 */
export async function signUp(db: Db, input: unknown): Promise<ServiceResult<{ email: string; role: Role }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Check the highlighted fields and try again.", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const data = parsed.data;

  const zone = await db.serviceZone.findFirst({
    where: { id: data.serviceZoneId, isActive: true },
    select: { id: true },
  });
  if (!zone) {
    return fail("VALIDATION", "That community isn't available.", {
      fieldErrors: { serviceZoneId: ["Choose your community"] },
    });
  }

  const passwordHash = await hash(data.password, 10);
  const common = { name: data.name, email: data.email, phone: data.phone, passwordHash };
  try {
    await db.user.create({
      data:
        data.role === "CUSTOMER"
          ? { ...common, role: "CUSTOMER", customerProfile: { create: { serviceZoneId: zone.id } } }
          : {
              ...common,
              role: "TRAINER",
              trainerProfile: {
                create: {
                  serviceZoneId: zone.id,
                  bio: data.bio,
                  experienceYears: data.experienceYears,
                  workoutCategories: data.workoutCategories,
                  specializations: [],
                },
              },
            },
    });
  } catch (err) {
    if (isUniqueViolationOn(err, "email")) {
      return fail("CONFLICT", "An account with this email already exists. Try signing in instead.", {
        fieldErrors: { email: ["This email is already registered"] },
      });
    }
    throw err;
  }
  return ok({ email: data.email, role: data.role });
}

/**
 * Finishes a Google sign-up. The identity (name, Google-verified email) comes from the server-side
 * session, never from the request; the account has no password, so only Google can open it until
 * the person sets one. Role and profile details are validated like a normal sign-up.
 */
export async function completeGoogleSignUp(
  db: Db,
  identity: { name: string; email: string },
  input: unknown,
): Promise<ServiceResult<{ role: Role }>> {
  const parsed = completeGoogleSignUpSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Check the highlighted fields and try again.", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const data = parsed.data;
  const zone = await db.serviceZone.findFirst({
    where: { id: data.serviceZoneId, isActive: true },
    select: { id: true },
  });
  if (!zone) {
    return fail("VALIDATION", "That community isn't available.", {
      fieldErrors: { serviceZoneId: ["Choose your community"] },
    });
  }
  const common = {
    name: identity.name.trim().slice(0, 80) || "Zuryo member",
    email: identity.email.toLowerCase(),
    phone: data.phone,
  };
  try {
    await db.user.create({
      data:
        data.role === "CUSTOMER"
          ? { ...common, role: "CUSTOMER", customerProfile: { create: { serviceZoneId: zone.id } } }
          : {
              ...common,
              role: "TRAINER",
              trainerProfile: {
                create: {
                  serviceZoneId: zone.id,
                  bio: data.bio,
                  experienceYears: data.experienceYears,
                  workoutCategories: data.workoutCategories,
                  specializations: [],
                },
              },
            },
    });
  } catch (err) {
    if (isUniqueViolationOn(err, "email")) {
      return fail(
        "CONFLICT",
        "An account with this email already exists. Sign in with Google again to continue.",
      );
    }
    throw err;
  }
  return ok({ role: data.role });
}

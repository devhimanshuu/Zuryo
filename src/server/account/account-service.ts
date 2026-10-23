import "server-only";
import { compare, hash } from "bcryptjs";
import type { Db } from "@/lib/db";
import type { Role, WorkoutCategory } from "@/lib/validation/enums";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking/rules";
import { FRESH_AUTH_WINDOW_MS, passwordChangeSchema, profileSchema } from "@/lib/validation/account";
import { fail, ok, type ServiceResult } from "@/server/booking/errors";
import type { Actor } from "@/server/auth/actor";

export type AccountView = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  createdAt: Date;
  /** Whether a password sign-in exists. Never the hash itself. */
  hasPassword: boolean;
  zone: { id: string; name: string; city: string } | null;
  /** Customers: tower / block and flat. */
  addressLine: string | null;
  trainer: {
    bio: string | null;
    experienceYears: number | null;
    workoutCategories: WorkoutCategory[];
    specializations: string[];
    acceptingBookings: boolean;
  } | null;
};

export async function getAccount(db: Db, userId: string): Promise<AccountView | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
      passwordHash: true,
      customerProfile: {
        select: { addressLine: true, serviceZone: { select: { id: true, name: true, city: true } } },
      },
      trainerProfile: {
        select: {
          bio: true,
          experienceYears: true,
          workoutCategories: true,
          specializations: true,
          isActive: true,
          serviceZone: { select: { id: true, name: true, city: true } },
        },
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
    hasPassword: user.passwordHash !== null,
    zone: user.customerProfile?.serviceZone ?? user.trainerProfile?.serviceZone ?? null,
    addressLine: user.customerProfile?.addressLine ?? null,
    trainer: user.trainerProfile
      ? {
          bio: user.trainerProfile.bio,
          experienceYears: user.trainerProfile.experienceYears,
          workoutCategories: user.trainerProfile.workoutCategories,
          specializations: user.trainerProfile.specializations,
          acceptingBookings: user.trainerProfile.isActive,
        }
      : null,
  };
}

/** Updates the signed-in user's own details. The acting user is the only row that can change. */
export async function updateProfile(
  db: Db,
  actor: Actor,
  input: unknown,
): Promise<ServiceResult<{ name: string }>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Check the highlighted fields and try again.", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const data = parsed.data;
  // The role in the payload only selects the schema; it must match who is acting.
  if (data.role !== actor.role) return fail("FORBIDDEN", "That doesn't match your account type.");

  // Moving community is refused while sessions are booked: they were matched to people and places
  // in the old one, and silently re-homing them would break those bookings.
  if (data.role !== "OPERATIONS" && data.serviceZoneId) {
    const current =
      data.role === "CUSTOMER"
        ? await db.customerProfile.findUnique({
            where: { userId: actor.userId },
            select: { serviceZoneId: true },
          })
        : await db.trainerProfile.findUnique({
            where: { userId: actor.userId },
            select: { serviceZoneId: true },
          });
    if (current && current.serviceZoneId !== data.serviceZoneId) {
      const zone = await db.serviceZone.findFirst({
        where: { id: data.serviceZoneId, isActive: true },
        select: { id: true },
      });
      if (!zone) {
        return fail("VALIDATION", "That community isn't available.", {
          fieldErrors: { serviceZoneId: ["Choose a community from the list"] },
        });
      }
      const open = await db.booking.count({
        where: {
          ...(data.role === "CUSTOMER" ? { customerId: actor.userId } : { trainerId: actor.userId }),
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
          endAt: { gte: new Date() },
        },
      });
      if (open > 0) {
        return fail(
          "CONFLICT",
          "You have upcoming sessions, so your community can't change yet. Finish or cancel them first.",
          { fieldErrors: { serviceZoneId: ["Not while you have upcoming sessions"] } },
        );
      }
    }
  }

  await db.user.update({
    where: { id: actor.userId },
    data: {
      name: data.name,
      phone: data.phone ?? null,
      ...(data.role === "CUSTOMER"
        ? {
            customerProfile: {
              update: {
                addressLine: data.addressLine ?? null,
                ...(data.serviceZoneId ? { serviceZoneId: data.serviceZoneId } : {}),
              },
            },
          }
        : {}),
      ...(data.role === "TRAINER"
        ? {
            trainerProfile: {
              update: {
                bio: data.bio ?? null,
                experienceYears: data.experienceYears ?? null,
                workoutCategories: data.workoutCategories,
                ...(data.specializations ? { specializations: data.specializations } : {}),
                ...(data.acceptingBookings === undefined ? {} : { isActive: data.acceptingBookings }),
                ...(data.serviceZoneId ? { serviceZoneId: data.serviceZoneId } : {}),
              },
            },
          }
        : {}),
    },
  });
  return ok({ name: data.name });
}

// ─── Password ────────────────────────────────────────────────────────────────

/** How the current session proved itself, read from the signed session by the action. */
export type SessionProof = { method?: "password" | "google"; at?: number };

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; until: number }>();

/** Per-user brake on guessing the current password. In-memory, so it is per server instance. */
function lockedFor(userId: string, now: number): number {
  const f = failures.get(userId);
  return f && f.count >= MAX_FAILURES && f.until > now ? f.until - now : 0;
}
function recordFailure(userId: string, now: number) {
  const f = failures.get(userId);
  const live = f && f.until > now ? f : { count: 0, until: now + LOCK_MS };
  failures.set(userId, { count: live.count + 1, until: live.until });
}

/** A Google sign-in made in the last few minutes. A password sign-in never counts here. */
export function hasFreshGoogleProof(proof: SessionProof, now = Date.now()): boolean {
  return proof.method === "google" && typeof proof.at === "number" && now - proof.at <= FRESH_AUTH_WINDOW_MS;
}

/**
 * Sets or changes the password for the signed-in user.
 *  - Has a password: the current password is required, unless this session was just re-verified
 *    with Google (the "forgot my password" path).
 *  - No password yet (Google sign-up): a fresh Google sign-in is required, so a stolen or idle
 *    session can't plant a password that outlives it.
 * The write is conditional on the stored hash not having changed, so two racing requests can't
 * both succeed. Email is never touched, so Google matching keeps working.
 */
export async function updatePassword(
  db: Db,
  actor: Actor,
  proof: SessionProof,
  input: unknown,
  now = Date.now(),
): Promise<ServiceResult<{ hadPassword: boolean }>> {
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Check the highlighted fields and try again.", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { passwordHash: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return fail("FORBIDDEN", "Your account can't change its password.");

  const fresh = hasFreshGoogleProof(proof, now);
  const previous = user.passwordHash;

  if (previous === null) {
    if (!fresh) {
      return fail(
        "FORBIDDEN",
        "For your security, confirm it's you with Google again before setting a password.",
      );
    }
  } else if (currentPassword) {
    const wait = lockedFor(actor.userId, now);
    if (wait > 0) {
      return fail(
        "UNAVAILABLE",
        `Too many incorrect attempts. Try again in ${Math.ceil(wait / 60_000)} minutes.`,
      );
    }
    if (!(await compare(currentPassword, previous))) {
      recordFailure(actor.userId, now);
      return fail("VALIDATION", "That isn't your current password.", {
        fieldErrors: { currentPassword: ["That isn't your current password"] },
      });
    }
    failures.delete(actor.userId);
  } else if (!fresh) {
    return fail("VALIDATION", "Enter your current password.", {
      fieldErrors: { currentPassword: ["Enter your current password"] },
    });
  }

  if (previous !== null && (await compare(newPassword, previous))) {
    return fail("VALIDATION", "Choose a password you haven't used here before.", {
      fieldErrors: { newPassword: ["Choose a different password from your current one"] },
    });
  }

  const changed = await db.user.updateMany({
    where: { id: actor.userId, passwordHash: previous },
    data: { passwordHash: await hash(newPassword, 10) },
  });
  if (changed.count !== 1) {
    return fail("CONFLICT", "Your password was changed somewhere else. Reload the page and try again.");
  }
  return ok({ hadPassword: previous !== null });
}

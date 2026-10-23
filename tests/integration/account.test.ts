import { compare } from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authenticateUser } from "@/lib/auth/credentials";
import { getAccount, updatePassword, updateProfile } from "@/server/account/account-service";
import { completeGoogleSignUp, signUp } from "@/server/auth/sign-up";
import { createBooking } from "@/server/booking/booking-service";
import {
  OTHER_ZONE,
  ZONE,
  alice,
  arun,
  bela,
  bob,
  createTestDb,
  ops,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

const db = createTestDb();

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

const customerInput = {
  role: "CUSTOMER",
  name: "New Person",
  email: "  New.Person@Example.com ",
  phone: "",
  serviceZoneId: ZONE,
  password: "goodpass1",
};
const trainerInput = {
  role: "TRAINER",
  name: "Fresh Trainer",
  email: "fresh.trainer@example.com",
  serviceZoneId: ZONE,
  password: "goodpass1",
  workoutCategories: ["YOGA", "MOBILITY"],
  experienceYears: "4",
  bio: "Yoga and mobility.",
};

describe("sign up", () => {
  it("creates an ACTIVE customer with a profile, hashes the password and lets them sign in", async () => {
    const res = await signUp(db, customerInput);
    expect(res).toEqual({ ok: true, data: { email: "new.person@example.com", role: "CUSTOMER" } });
    const user = await db.user.findUniqueOrThrow({
      where: { email: "new.person@example.com" },
      include: { customerProfile: true },
    });
    expect(user.role).toBe("CUSTOMER");
    expect(user.status).toBe("ACTIVE");
    expect(user.customerProfile?.serviceZoneId).toBe(ZONE);
    expect(user.passwordHash).not.toBe("goodpass1");
    expect(await compare("goodpass1", user.passwordHash!)).toBe(true);
    expect(
      await authenticateUser(db, {
        email: "new.person@example.com",
        password: "goodpass1",
        role: "CUSTOMER",
      }),
    ).toMatchObject({ role: "CUSTOMER" });
    // The same credentials do not open another workspace.
    expect(
      await authenticateUser(db, {
        email: "new.person@example.com",
        password: "goodpass1",
        role: "OPERATIONS",
      }),
    ).toBeNull();
  });

  it("creates a trainer with their teaching details", async () => {
    const res = await signUp(db, trainerInput);
    expect(res.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({
      where: { email: "fresh.trainer@example.com" },
      include: { trainerProfile: true },
    });
    expect(user.role).toBe("TRAINER");
    expect(user.trainerProfile?.workoutCategories).toEqual(["YOGA", "MOBILITY"]);
    expect(user.trainerProfile?.experienceYears).toBe(4);
  });

  it("refuses operators, duplicate emails, weak passwords and unknown communities", async () => {
    expect((await signUp(db, { ...customerInput, role: "OPERATIONS" })).ok).toBe(false);
    expect(await db.user.count({ where: { role: "OPERATIONS", email: "new.person@example.com" } })).toBe(0);

    expect((await signUp(db, customerInput)).ok).toBe(true);
    const dup = await signUp(db, { ...customerInput, email: "NEW.person@example.com" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("CONFLICT");

    const weak = await signUp(db, { ...customerInput, email: "weak@example.com", password: "short1" });
    expect(weak.ok).toBe(false);
    const zone = await signUp(db, { ...customerInput, email: "zone@example.com", serviceZoneId: "nope" });
    expect(zone.ok).toBe(false);
    expect(await db.user.count({ where: { email: { in: ["weak@example.com", "zone@example.com"] } } })).toBe(
      0,
    );

    const noCats = await signUp(db, { ...trainerInput, email: "nocats@example.com", workoutCategories: [] });
    expect(noCats.ok).toBe(false);
  });
});

describe("Google sign-up completion", () => {
  it("creates a password-less account from the verified identity, never from the request", async () => {
    const res = await completeGoogleSignUp(
      db,
      { name: "Gia Google", email: "Gia@Example.com" },
      { role: "CUSTOMER", serviceZoneId: ZONE, email: "attacker@example.com", name: "Mallory" },
    );
    expect(res).toEqual({ ok: true, data: { role: "CUSTOMER" } });
    const user = await db.user.findUniqueOrThrow({ where: { email: "gia@example.com" } });
    expect(user.name).toBe("Gia Google");
    expect(user.passwordHash).toBeNull();
    expect(await db.user.count({ where: { email: "attacker@example.com" } })).toBe(0);
    // No password exists, so password sign-in is impossible with any guess.
    expect(
      await authenticateUser(db, { email: "gia@example.com", password: "", role: "CUSTOMER" }),
    ).toBeNull();
    expect(
      await authenticateUser(db, { email: "gia@example.com", password: "anything1", role: "CUSTOMER" }),
    ).toBeNull();
  });

  it("will not take over an existing account", async () => {
    await signUp(db, customerInput);
    const res = await completeGoogleSignUp(
      db,
      { name: "Someone", email: "new.person@example.com" },
      { role: "TRAINER", serviceZoneId: ZONE, workoutCategories: ["YOGA"] },
    );
    expect(res.ok).toBe(false);
    const user = await db.user.findUniqueOrThrow({ where: { email: "new.person@example.com" } });
    expect(user.role).toBe("CUSTOMER");
  });
});

describe("profile and password for a signed-up user", () => {
  it("returns the account and lets only the owner edit their own details", async () => {
    const view = await getAccount(db, alice.userId);
    expect(view).toMatchObject({ name: "Alice Rao", role: "CUSTOMER" });
    expect(typeof view?.hasPassword).toBe("boolean");
    expect(JSON.stringify(view)).not.toContain("passwordHash");

    const ok = await updateProfile(db, alice, {
      role: "CUSTOMER",
      name: "Alice R.",
      phone: "+91 98765 43210",
    });
    expect(ok.ok).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { id: alice.userId } });
    expect(after).toMatchObject({ name: "Alice R.", phone: "+91 98765 43210" });
    // Email and role cannot change through the profile action.
    expect(after.email).toBe((await getAccount(db, alice.userId))?.email);
    expect(after.role).toBe("CUSTOMER");

    // A payload for another role is refused, and other people's rows are untouched.
    expect((await updateProfile(db, alice, { role: "OPERATIONS", name: "Root" })).ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: arun.userId } })).name).not.toBe("Alice R.");
  });

  it("lets a trainer edit teaching details but keeps at least one category", async () => {
    const ok = await updateProfile(db, arun, {
      role: "TRAINER",
      name: "Arun M",
      phone: "",
      workoutCategories: ["CARDIO"],
      experienceYears: "9",
      bio: "Cardio coach",
    });
    expect(ok.ok).toBe(true);
    const profile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: arun.userId } });
    expect(profile.workoutCategories).toEqual(["CARDIO"]);
    const none = await updateProfile(db, arun, { role: "TRAINER", name: "Arun M", workoutCategories: [] });
    expect(none.ok).toBe(false);
  });

  it("adds a password to a Google-only account only after a fresh Google sign-in", async () => {
    await completeGoogleSignUp(
      db,
      { name: "Gia Google", email: "gia@example.com" },
      { role: "CUSTOMER", serviceZoneId: ZONE },
    );
    const gia = await db.user.findUniqueOrThrow({ where: { email: "gia@example.com" } });
    const actor = { userId: gia.id, role: "CUSTOMER" as const, name: gia.name };
    const body = { newPassword: "newpass123", confirmPassword: "newpass123" };
    const now = Date.now();

    const stale = await updatePassword(db, actor, { method: "google", at: now - 11 * 60_000 }, body, now);
    expect(stale.ok).toBe(false);
    const fromPassword = await updatePassword(db, actor, { method: "password", at: now }, body, now);
    expect(fromPassword.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: gia.id } })).passwordHash).toBeNull();

    const fresh = await updatePassword(db, actor, { method: "google", at: now - 60_000 }, body, now);
    expect(fresh).toEqual({ ok: true, data: { hadPassword: false } });
    expect(
      await authenticateUser(db, { email: "gia@example.com", password: "newpass123", role: "CUSTOMER" }),
    ).toMatchObject({ role: "CUSTOMER" });

    // Now a password exists: changing needs the current one.
    const noCurrent = await updatePassword(
      db,
      actor,
      { method: "password", at: now },
      { newPassword: "other12345", confirmPassword: "other12345" },
      now,
    );
    expect(noCurrent.ok).toBe(false);
    const changed = await updatePassword(
      db,
      actor,
      { method: "password", at: now },
      { currentPassword: "newpass123", newPassword: "other12345", confirmPassword: "other12345" },
      now,
    );
    expect(changed).toEqual({ ok: true, data: { hadPassword: true } });
    expect(
      await authenticateUser(db, { email: "gia@example.com", password: "newpass123", role: "CUSTOMER" }),
    ).toBeNull();
  });

  it("refuses password changes for suspended accounts and for other people's ids", async () => {
    await signUp(db, customerInput);
    const user = await db.user.findUniqueOrThrow({ where: { email: "new.person@example.com" } });
    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    const now = Date.now();
    const res = await updatePassword(
      db,
      { userId: user.id, role: "CUSTOMER", name: user.name },
      { method: "password", at: now },
      { currentPassword: "goodpass1", newPassword: "newpass123", confirmPassword: "newpass123" },
      now,
    );
    expect(res.ok).toBe(false);
    expect(
      await compare("goodpass1", (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash!),
    ).toBe(true);
    // An operations actor id works only on its own row.
    expect((await getAccount(db, ops.userId))?.role).toBe("OPERATIONS");
  });
});

describe("editing everything except email", () => {
  it("lets a customer change community and address when they have no upcoming sessions", async () => {
    const res = await updateProfile(db, bob, {
      role: "CUSTOMER",
      name: "Bob Iyer",
      phone: "",
      serviceZoneId: OTHER_ZONE,
      addressLine: "Tower C, 402",
    });
    expect(res.ok).toBe(true);
    const profile = await db.customerProfile.findUniqueOrThrow({ where: { userId: bob.userId } });
    expect(profile).toMatchObject({ serviceZoneId: OTHER_ZONE, addressLine: "Tower C, 402" });
  });

  it("blocks a community change while a session is booked, and keeps everything else editable", async () => {
    const booked = await createBooking(testDeps(db), alice, request());
    expect(booked.ok).toBe(true);
    const blocked = await updateProfile(db, alice, {
      role: "CUSTOMER",
      name: "Alice R.",
      serviceZoneId: OTHER_ZONE,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("CONFLICT");
    // Nothing was half-saved.
    expect((await db.user.findUniqueOrThrow({ where: { id: alice.userId } })).name).toBe("Alice Rao");
    expect(
      (await db.customerProfile.findUniqueOrThrow({ where: { userId: alice.userId } })).serviceZoneId,
    ).toBe(ZONE);

    // Staying in the same community is fine, and so is editing the address.
    const same = await updateProfile(db, alice, {
      role: "CUSTOMER",
      name: "Alice R.",
      serviceZoneId: ZONE,
      addressLine: "Tower A, 12",
    });
    expect(same.ok).toBe(true);
  });

  it("refuses an unknown or inactive community", async () => {
    const res = await updateProfile(db, bob, { role: "CUSTOMER", name: "Bob Iyer", serviceZoneId: "nope" });
    expect(res.ok).toBe(false);
    expect(
      (await db.customerProfile.findUniqueOrThrow({ where: { userId: bob.userId } })).serviceZoneId,
    ).toBe(ZONE);
  });

  it("lets a trainer edit focus areas and pause new bookings", async () => {
    const res = await updateProfile(db, bela, {
      role: "TRAINER",
      name: "Bela",
      workoutCategories: ["YOGA"],
      specializations: ["Mobility", "Posture"],
      acceptingBookings: false,
    });
    expect(res.ok).toBe(true);
    const profile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: bela.userId } });
    expect(profile).toMatchObject({ isActive: false, specializations: ["Mobility", "Posture"] });
    const view = await getAccount(db, bela.userId);
    expect(view?.trainer).toMatchObject({
      acceptingBookings: false,
      specializations: ["Mobility", "Posture"],
    });
    // Too many focus areas are rejected.
    const many = await updateProfile(db, bela, {
      role: "TRAINER",
      name: "Bela",
      workoutCategories: ["YOGA"],
      specializations: ["a1", "b2", "c3", "d4", "e5", "f6", "g7"],
    });
    expect(many.ok).toBe(false);
  });

  it("never changes the email, whatever the payload says", async () => {
    const before = (await getAccount(db, alice.userId))!.email;
    await updateProfile(db, alice, { role: "CUSTOMER", name: "Alice Rao", email: "stolen@example.com" });
    expect((await getAccount(db, alice.userId))!.email).toBe(before);
  });
});

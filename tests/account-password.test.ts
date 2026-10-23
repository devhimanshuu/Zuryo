import { hash } from "bcryptjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { FRESH_AUTH_WINDOW_MS, passwordChangeSchema } from "@/lib/validation/account";
import { hasFreshGoogleProof, updatePassword } from "@/server/account/account-service";
import type { Actor } from "@/server/auth/actor";

/** A stand-in for the two Prisma calls updatePassword makes. */
function fakeDb(passwordHash: string | null, changed = 1, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const updateMany = vi.fn().mockResolvedValue({ count: changed });
  const db = {
    user: { findUnique: vi.fn().mockResolvedValue({ passwordHash, status }), updateMany },
  } as unknown as Db;
  return { db, updateMany };
}

let CURRENT: string;
beforeAll(async () => {
  CURRENT = await hash("current1pass", 4);
});

const NOW = 1_700_000_000_000;
const actorFor = (id: string): Actor => ({ userId: id, role: "CUSTOMER", name: "Test" });
const freshGoogle = { method: "google" as const, at: NOW - 60_000 };
const staleGoogle = { method: "google" as const, at: NOW - FRESH_AUTH_WINDOW_MS - 1 };
const passwordSession = { method: "password" as const, at: NOW };
const change = (extra: object = {}) => ({
  newPassword: "brandnew1pass",
  confirmPassword: "brandnew1pass",
  ...extra,
});

describe("fresh Google proof", () => {
  it("only counts a recent Google sign-in", () => {
    expect(hasFreshGoogleProof(freshGoogle, NOW)).toBe(true);
    expect(hasFreshGoogleProof(staleGoogle, NOW)).toBe(false);
    expect(hasFreshGoogleProof(passwordSession, NOW)).toBe(false);
    expect(hasFreshGoogleProof({}, NOW)).toBe(false);
  });
});

describe("password input", () => {
  it("needs the two entries to match and meet the strength rules", () => {
    expect(passwordChangeSchema.safeParse(change()).success).toBe(true);
    expect(passwordChangeSchema.safeParse(change({ confirmPassword: "different1" })).success).toBe(false);
    expect(
      passwordChangeSchema.safeParse(change({ newPassword: "short1", confirmPassword: "short1" })).success,
    ).toBe(false);
    expect(
      passwordChangeSchema.safeParse(change({ newPassword: "nodigitshere", confirmPassword: "nodigitshere" }))
        .success,
    ).toBe(false);
  });
});

describe("setting a first password (Google sign-up)", () => {
  it("is refused without a fresh Google sign-in", async () => {
    for (const proof of [staleGoogle, passwordSession, {}]) {
      const { db, updateMany } = fakeDb(null);
      const res = await updatePassword(db, actorFor("a"), proof, change(), NOW);
      expect(res.ok).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    }
  });

  it("works right after Google re-verification, and only if nothing changed underneath", async () => {
    const ok = fakeDb(null);
    const res = await updatePassword(ok.db, actorFor("a"), freshGoogle, change(), NOW);
    expect(res).toEqual({ ok: true, data: { hadPassword: false } });
    expect(ok.updateMany.mock.calls[0]![0].where).toEqual({ id: "a", passwordHash: null });

    const raced = fakeDb(null, 0);
    const lost = await updatePassword(raced.db, actorFor("a"), freshGoogle, change(), NOW);
    expect(lost.ok).toBe(false);
  });
});

describe("changing an existing password", () => {
  it("requires the current password", async () => {
    const { db, updateMany } = fakeDb(CURRENT);
    const none = await updatePassword(db, actorFor("b"), passwordSession, change(), NOW);
    expect(none.ok).toBe(false);
    const wrong = await updatePassword(
      db,
      actorFor("b"),
      passwordSession,
      change({ currentPassword: "nope" }),
      NOW,
    );
    expect(wrong.ok).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("accepts the correct current password and rejects reusing it", async () => {
    const { db, updateMany } = fakeDb(CURRENT);
    const same = await updatePassword(
      db,
      actorFor("c"),
      passwordSession,
      change({
        currentPassword: "current1pass",
        newPassword: "current1pass",
        confirmPassword: "current1pass",
      }),
      NOW,
    );
    expect(same.ok).toBe(false);
    const done = await updatePassword(
      db,
      actorFor("c"),
      passwordSession,
      change({ currentPassword: "current1pass" }),
      NOW,
    );
    expect(done).toEqual({ ok: true, data: { hadPassword: true } });
    expect(updateMany.mock.calls[0]![0].where).toEqual({ id: "c", passwordHash: CURRENT });
  });

  it("lets a fresh Google sign-in reset a forgotten password, but a stale one cannot", async () => {
    const { db } = fakeDb(CURRENT);
    expect((await updatePassword(db, actorFor("d"), freshGoogle, change(), NOW)).ok).toBe(true);
    expect((await updatePassword(db, actorFor("d"), staleGoogle, change(), NOW)).ok).toBe(false);
  });

  it("locks guessing after five wrong current passwords", async () => {
    const { db, updateMany } = fakeDb(CURRENT);
    for (let i = 0; i < 5; i++) {
      await updatePassword(db, actorFor("e"), passwordSession, change({ currentPassword: `wrong${i}` }), NOW);
    }
    const locked = await updatePassword(
      db,
      actorFor("e"),
      passwordSession,
      change({ currentPassword: "current1pass" }),
      NOW,
    );
    expect(locked.ok).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("is refused for suspended accounts", async () => {
    const { db, updateMany } = fakeDb(CURRENT, 1, "SUSPENDED");
    const res = await updatePassword(
      db,
      actorFor("f"),
      passwordSession,
      change({ currentPassword: "current1pass" }),
      NOW,
    );
    expect(res.ok).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashSync } from "bcryptjs";
import { authenticateUser } from "@/lib/auth/credentials";
import { alice, arun, createTestDb, ops, resetAndSeed, TEST_PASSWORD } from "./helpers";

const db = createTestDb();

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

describe("credentials authentication", () => {
  it("signs in with the correct email, password and workspace", async () => {
    const user = await authenticateUser(db, {
      email: "it_alice@test.example",
      password: TEST_PASSWORD,
      role: "CUSTOMER",
    });
    expect(user).not.toBeNull();
    expect(user).toMatchObject({ id: alice.userId, name: alice.name, role: "CUSTOMER" });
  });

  it("treats email as case-insensitive and trims it", async () => {
    const user = await authenticateUser(db, {
      email: "  IT_ALICE@TEST.EXAMPLE ",
      password: TEST_PASSWORD,
      role: "CUSTOMER",
    });
    expect(user?.id).toBe(alice.userId);
  });

  it.each([
    ["a wrong password", { email: "it_alice@test.example", password: "nope", role: "CUSTOMER" }],
    ["an unknown email", { email: "nobody@test.example", password: TEST_PASSWORD, role: "CUSTOMER" }],
    ["the wrong workspace for the role", { email: "it_alice@test.example", password: TEST_PASSWORD, role: "TRAINER" }],
    ["a trainer signing into the customer workspace", { email: "it_arun@test.example", password: TEST_PASSWORD, role: "CUSTOMER" }],
    ["a missing password", { email: "it_alice@test.example", role: "CUSTOMER" }],
    ["garbage input", { email: 42, password: null, role: "CUSTOMER" }],
  ])("refuses %s", async (_label, input) => {
    expect(await authenticateUser(db, input)).toBeNull();
  });

  it("refuses suspended users", async () => {
    await db.user.update({ where: { id: alice.userId }, data: { status: "SUSPENDED" } });
    expect(
      await authenticateUser(db, { email: "it_alice@test.example", password: TEST_PASSWORD, role: "CUSTOMER" }),
    ).toBeNull();
  });

  it("refuses users without a stored password hash", async () => {
    await db.user.update({ where: { id: alice.userId }, data: { passwordHash: null } });
    expect(
      await authenticateUser(db, { email: "it_alice@test.example", password: TEST_PASSWORD, role: "CUSTOMER" }),
    ).toBeNull();
  });

  it("verifies against the real bcrypt hash, not a plaintext comparison", async () => {
    await db.user.update({
      where: { id: alice.userId },
      data: { passwordHash: hashSync("some-other-password", 10) },
    });
    expect(
      await authenticateUser(db, { email: "it_alice@test.example", password: TEST_PASSWORD, role: "CUSTOMER" }),
    ).toBeNull();
    expect(
      await authenticateUser(db, { email: "it_alice@test.example", password: "some-other-password", role: "CUSTOMER" }),
    ).not.toBeNull();
  });

  it("every role can sign into its own workspace", async () => {
    expect(await authenticateUser(db, { email: "it_arun@test.example", password: TEST_PASSWORD, role: "TRAINER" })).toMatchObject(
      { id: arun.userId },
    );
    expect(await authenticateUser(db, { email: "ops@test.example", password: TEST_PASSWORD, role: "OPERATIONS" })).toMatchObject({
      id: ops.userId,
    });
  });
});

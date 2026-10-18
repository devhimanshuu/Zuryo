import { describe, expect, it } from "vitest";
import { ROLE_HOME, ROLES, bookingStatusSchema, roleSchema } from "@/lib/validation/enums";

describe("role enum", () => {
  it("accepts the three product roles", () => {
    for (const r of ["CUSTOMER", "TRAINER", "OPERATIONS"]) expect(roleSchema.parse(r)).toBe(r);
  });

  it("rejects unknown, lower-case or empty roles", () => {
    for (const r of ["ADMIN", "customer", "", null, undefined])
      expect(roleSchema.safeParse(r).success).toBe(false);
  });

  it("gives every role a workspace home", () => {
    expect(Object.keys(ROLE_HOME).sort()).toEqual([...ROLES].sort());
  });
});

describe("booking status enum", () => {
  it("rejects statuses the state machine doesn't define", () => {
    expect(bookingStatusSchema.safeParse("RESCHEDULED").success).toBe(false);
    expect(bookingStatusSchema.safeParse("IN_PROGRESS").success).toBe(true);
  });
});

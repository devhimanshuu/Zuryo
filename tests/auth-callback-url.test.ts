import { describe, expect, it } from "vitest";
import { roleForCallback, safeCallbackUrl } from "@/lib/auth/callback-url";

const ORIGIN = "http://localhost:3000";

describe("safe sign-in callback URLs", () => {
  it("accepts an absolute same-origin callback for the selected workspace", () => {
    const callback = "http://localhost:3000/customer/bookings/new?mode=instant";
    expect(roleForCallback(callback, ORIGIN)).toBe("CUSTOMER");
    expect(safeCallbackUrl(callback, "CUSTOMER", ORIGIN)).toBe("/customer/bookings/new?mode=instant");
  });

  it("accepts a relative internal workspace path", () => {
    expect(roleForCallback("/trainer/sessions", ORIGIN)).toBe("TRAINER");
    expect(safeCallbackUrl("/trainer/sessions", "TRAINER", ORIGIN)).toBe("/trainer/sessions");
  });

  it.each([
    "https://attacker.example/customer",
    "//attacker.example/customer",
    "\\\\attacker.example\\customer",
    "http://localhost:3000/operations",
    "http://localhost:3000/customer-evil",
    "javascript:alert(1)",
  ])("rejects unsafe or role-inconsistent callback %s", (value) => {
    expect(roleForCallback(value, ORIGIN) === "CUSTOMER" ? safeCallbackUrl(value, "CUSTOMER", ORIGIN) : null).toBeNull();
    expect(safeCallbackUrl(value, "CUSTOMER", ORIGIN)).toBeNull();
  });

  it("does not infer a role from a public path", () => {
    expect(roleForCallback("/sign-in", ORIGIN)).toBeNull();
    expect(roleForCallback("/", ORIGIN)).toBeNull();
    expect(safeCallbackUrl("/sign-in", "CUSTOMER", ORIGIN)).toBeNull();
  });
});

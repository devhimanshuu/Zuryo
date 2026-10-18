import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV, isActive } from "@/components/layout/nav-config";

const APP = join(__dirname, "../src/app");
const GROUP = { CUSTOMER: "(customer)", TRAINER: "(trainer)", OPERATIONS: "(operations)" } as const;

describe("role navigation", () => {
  it("links only to routes that exist", () => {
    for (const [role, { items }] of Object.entries(NAV) as [keyof typeof GROUP, (typeof NAV)["CUSTOMER"]][]) {
      for (const item of items) {
        const file = join(APP, GROUP[role], item.href, "page.tsx");
        expect(existsSync(file), `${role} → ${item.href}`).toBe(true);
      }
    }
  });

  it("keeps each role's links inside its own workspace", () => {
    expect(NAV.CUSTOMER.items.every((i) => i.href.startsWith("/customer"))).toBe(true);
    expect(NAV.TRAINER.items.every((i) => i.href.startsWith("/trainer"))).toBe(true);
    expect(NAV.OPERATIONS.items.every((i) => i.href.startsWith("/operations"))).toBe(true);
  });

  it("highlights the home link only on the home page", () => {
    expect(isActive("/customer", "/customer", "/customer")).toBe(true);
    expect(isActive("/customer/bookings", "/customer", "/customer")).toBe(false);
    expect(isActive("/customer/bookings/ZY-1", "/customer/bookings", "/customer")).toBe(true);
  });
});

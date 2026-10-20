import { expect, test } from "@playwright/test";
import { ALICE, signInAsCustomer } from "./auth-helpers";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only spec");
});

test.describe("authentication", () => {
  test("signs in with valid credentials and shows the signed-in identity", async ({ page }) => {
    await signInAsCustomer(page);
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByText("Alice", { exact: true }).first()).toBeVisible();
  });

  test("rejects a wrong password without entering a workspace", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(ALICE.email);
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Couldn't sign you in")).toBeVisible();
    expect(page.url()).toContain("/sign-in");
  });

  test("bounces an unauthenticated visitor from protected pages to sign-in", async ({ page }) => {
    await page.goto("/customer");
    await page.waitForURL(/\/sign-in\?callbackUrl=/);
  });

  test("a customer cannot enter another role's workspace", async ({ page }) => {
    await signInAsCustomer(page);
    await page.goto("/operations");
    await page.waitForURL("**/customer");
  });

  test("signs out and loses access", async ({ page }) => {
    await signInAsCustomer(page);
    // Wait for hydration: a click before React attaches the handler is silently dropped.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Sign out" }).click();
    // `signOut()` clears the session cookie over the network and only then navigates. Under a
    // loaded suite that navigation can land while the cookie is still live, so middleware bounces
    // /sign-in back to /customer and the assertion below would see a signed-in page. Wait for the
    // precondition the test actually depends on — the session being gone — then assert the result.
    await page.waitForURL("**/sign-in");
    await expect
      .poll(() => page.evaluate(() => fetch("/api/auth/session").then((r) => r.json())), {
        message: "session should be cleared after signing out",
        timeout: 20_000,
      })
      .toBeNull();
    await page.goto("/customer");
    await page.waitForURL(/\/sign-in\?callbackUrl=/);
  });
});

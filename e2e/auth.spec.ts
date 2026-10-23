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

  test("cancelling the sign-out confirmation dialog stays signed in", async ({ page }) => {
    await signInAsCustomer(page);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Log out of Zuryo?")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Signed in as")).toBeVisible();
  });

  test("signs out and loses access", async ({ page }) => {
    await signInAsCustomer(page);
    // Wait for hydration: a click before React attaches the handler is silently dropped.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Sign out" }).click();

    // Confirm in the warning dialog:
    await page.getByRole("dialog").getByRole("button", { name: "Log out" }).click();

    // `signOut()` posts to clear the session cookie and then navigates to the sign-in page. Let
    // that navigation finish before touching the page again, or the next `goto` is reported as
    // "interrupted by another navigation".
    await page.waitForURL(/\/sign-in/);

    // Under suite load the navigation can race the cookie clear: middleware sees a live session
    // and bounces /sign-in back to /customer. Poll the session endpoint until it is genuinely
    // gone, regardless of which page the browser currently shows.
    await expect
      .poll(
        async () => {
          try {
            return await page.evaluate(async () => {
              const res = await fetch("/api/auth/session");
              const body = await res.json();
              return body && Object.keys(body).length > 0 ? "active" : null;
            });
          } catch {
            return null;
          }
        },
        { message: "session should be cleared after signing out", timeout: 30_000 },
      )
      .toBeNull();

    // Session is confirmed dead. Navigate to a protected page and verify the redirect.
    await page.goto("/customer");
    await page.waitForURL(/\/sign-in\?callbackUrl=/);
  });
});

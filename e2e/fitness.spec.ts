import { expect, test } from "@playwright/test";
import { signInAsCustomer } from "./auth-helpers";

/** Fitness profile + recommendations. The E2E server runs without any AI key, so every
 * generation deterministically uses the rule-based fallback and is labelled as such. */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only spec");
});

test.describe("fitness recommendations", () => {
  test("generates a clearly-labelled rule-based recommendation and books from it", async ({ page }) => {
    await signInAsCustomer(page);
    await page.goto("/customer/fitness");

    await page.getByRole("button", { name: /Generate workout/ }).click();
    await expect(page.getByText("Rule-based")).toBeVisible();
    await expect(page.getByText(/strength at beginner level/)).toBeVisible();

    // The booking link carries the category into the wizard. The wizard opens on the session-type
    // step (the recommendation doesn't decide instant vs scheduled for the customer), so walk
    // forward to the workout step to see the pre-selection it carried over.
    await page
      .getByRole("link", { name: /Book this workout/ })
      .first()
      .click();
    await page.waitForURL(/\/customer\/bookings\/new\?category=STRENGTH/);
    await page.getByText("Scheduled", { exact: true }).first().click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Pre-filled from your workout recommendation/)).toBeVisible();
    await expect(page.getByRole("radio", { name: /Strength/ })).toBeChecked();
  });

  test("enforces the one-per-minute generation cooldown", async ({ page }) => {
    await signInAsCustomer(page);
    await page.goto("/customer/fitness");
    await page.getByRole("button", { name: /Generate workout/ }).click();
    await expect(page.getByText("Rule-based")).toBeVisible();
    await page.getByRole("button", { name: /Generate workout/ }).click();
    await expect(page.getByText(/one per minute/)).toBeVisible();
  });
});

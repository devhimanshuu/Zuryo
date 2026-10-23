import { expect, test, type Page } from "@playwright/test";
import { signInAsCustomer } from "./auth-helpers";

/** Mobile layout sanity: the key screens must not scroll horizontally and keep one h1. */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only spec");
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow of ${overflow}px on ${page.url()}`).toBeLessThanOrEqual(1);
}

test("sign-in and customer screens fit the mobile viewport", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to ZuryoFit");
  await expectNoHorizontalOverflow(page);

  await signInAsCustomer(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
});

test("packages and fitness screens fit the mobile viewport", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/customer/packages");
  await expectNoHorizontalOverflow(page);
  await page.goto("/customer/fitness");
  await expectNoHorizontalOverflow(page);
});

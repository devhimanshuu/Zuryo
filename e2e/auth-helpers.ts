import type { Page } from "@playwright/test";
import { ALICE, E2E_PASSWORD } from "./fixtures";

/** Signs in to the given workspace and waits for its home page. */
export async function signInAs(page: Page, email: string, workspace: "Customer" | "Trainer" | "Operations") {
  await page.goto("/sign-in");
  // The workspace picker is a styled radio group: the real input is `sr-only`, so clicking it is
  // intercepted by the visible label. Click the label that owns the input instead.
  await page.locator(`label:has(input[name="workspace"][value="${workspace.toUpperCase()}"])`).click();
  await page.getByLabel("Email").fill(email);
  const password = page.getByLabel("Password");
  await password.fill(E2E_PASSWORD);
  // Submit from the field: a lazily painted decorative image can occasionally sit over the button
  // long enough to make a pointer click flaky. Enter exercises the same form submission.
  await password.press("Enter");
  await page.waitForURL(`**/${workspace.toLowerCase()}`);
}

/** Shared: signs in as the given customer and waits for the customer home page. */
export async function signInAsCustomer(page: Page, email: string = ALICE.email) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  const password = page.getByLabel("Password");
  await password.fill(E2E_PASSWORD);
  await password.press("Enter");
  await page.waitForURL("**/customer");
}

export { ALICE, E2E_PASSWORD };

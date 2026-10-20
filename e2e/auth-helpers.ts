import type { Page } from "@playwright/test";
import { ALICE, E2E_PASSWORD } from "./fixtures";

/** Signs in to the given workspace and waits for its home page. */
export async function signInAs(page: Page, email: string, workspace: "Customer" | "Trainer" | "Operations") {
  await page.goto("/sign-in");
  await page.getByRole("radio", { name: workspace }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**/${workspace.toLowerCase()}`);
}

/** Shared: signs in as the given customer and waits for the customer home page. */
export async function signInAsCustomer(page: Page, email: string = ALICE.email) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/customer");
}

export { ALICE, E2E_PASSWORD };

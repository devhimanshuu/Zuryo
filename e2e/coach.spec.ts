import { expect, test, type Page } from "@playwright/test";
import { signInAsCustomer } from "./auth-helpers";

/**
 * The fitness coach in the browser. The E2E server runs without any AI key, so the coach answers
 * from its deterministic rule-based replies — every reply is labelled "Curated answer", and the
 * scope and safety rules still apply (a medical question is held back, an emergency gets the
 * fixed safety reply).
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only spec");
});

const ask = async (page: Page, question: string) => {
  await page.getByLabel("Your question for the coach").fill(question);
  await page.getByRole("button", { name: "Send" }).click();
};

test.describe("fitness coach", () => {
  test("answers a question, keeps the thread and holds medical questions back", async ({ page }) => {
    await signInAsCustomer(page);
    await page.goto("/customer/coach");

    await expect(page.getByRole("heading", { name: "Coach", level: 1 })).toBeVisible();
    await expect(page.getByText(/Fitness questions only/).first()).toBeVisible();

    await ask(page, "How should I warm up before strength training?");
    // The rule-based reply is labelled honestly; the AI label would mean a provider answered.
    await expect(page.getByText("Curated answer").first()).toBeVisible();
    await expect(page.getByText(/warm-up: brisk walk/i).first()).toBeVisible();

    // The thread is stored server-side, so it survives a reload.
    await page.reload();
    await expect(page.getByText(/warm-up: brisk walk/i).first()).toBeVisible();

    await ask(page, "Can I take ibuprofen for my knee pain?");
    await expect(page.getByText("Not medical advice").first()).toBeVisible();
    await expect(page.getByText(/I can't help with medical questions/i).first()).toBeVisible();
  });

  test("answers an emergency from the safety guard", async ({ page }) => {
    await signInAsCustomer(page);
    await page.goto("/customer/coach");

    await ask(page, "I felt chest pain during my workout, what should I do?");
    await expect(page.getByText("Safety first").first()).toBeVisible();
    await expect(page.getByText(/call 112/).first()).toBeVisible();
  });
});

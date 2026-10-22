import { expect, test, type Page } from "@playwright/test";
import { signInAsCustomer } from "./auth-helpers";

/**
 * The fitness coach in the browser — a floating assistant available on every customer screen
 * rather than a page of its own. The E2E server runs without any AI key, so the coach answers from
 * its deterministic rule-based replies: every reply is labelled "Curated answer", and the scope and
 * safety rules still apply (a medical question is held back, an emergency gets the fixed safety
 * reply).
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only spec");
});

const openCoach = async (page: Page) => {
  await page.getByRole("button", { name: "Ask the coach" }).click();
  await expect(page.getByRole("dialog", { name: "Coach" })).toBeVisible();
};

const ask = async (page: Page, question: string) => {
  await page.getByLabel("Your question for the coach").fill(question);
  await page.getByRole("button", { name: "Send" }).click();
};

test.describe("fitness coach", () => {
  test("floats on the app, answers a question and holds medical questions back", async ({ page }) => {
    await signInAsCustomer(page);
    // No navigation to a coach route: the launcher is on the screen the customer signed in to.
    await expect(page.getByRole("button", { name: "Ask the coach" })).toBeVisible();

    await openCoach(page);
    await expect(page.getByText(/Fitness questions only/).first()).toBeVisible();

    await ask(page, "How should I warm up before strength training?");
    // The rule-based reply is labelled honestly; the AI label would mean a provider answered.
    await expect(page.getByText("Curated answer").first()).toBeVisible();
    await expect(page.getByText(/warm-up: brisk walk/i).first()).toBeVisible();

    // The thread is stored server-side, so reopening the panel after a reload restores it.
    await page.reload();
    await openCoach(page);
    await expect(page.getByText(/warm-up: brisk walk/i).first()).toBeVisible();

    await ask(page, "Can I take ibuprofen for my knee pain?");
    await expect(page.getByText("Not medical advice").first()).toBeVisible();
    await expect(page.getByText(/I can't help with medical questions/i).first()).toBeVisible();

    // Closing returns to the page underneath, and the launcher stays pinned to the viewport.
    await page.getByRole("button", { name: "Close coach panel" }).click();
    await expect(page.getByRole("dialog", { name: "Coach" })).toBeHidden();
    const launcher = await page.getByRole("button", { name: "Ask the coach" }).boundingBox();
    const viewport = page.viewportSize();
    expect(launcher).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(viewport!.width - (launcher!.x + launcher!.width)).toBeLessThan(64);
    expect(viewport!.height - (launcher!.y + launcher!.height)).toBeLessThan(64);
  });

  test("answers an emergency from the safety guard", async ({ page }) => {
    await signInAsCustomer(page);
    await openCoach(page);

    await ask(page, "I felt chest pain during my workout, what should I do?");
    await expect(page.getByText("Safety first").first()).toBeVisible();
    await expect(page.getByText(/call 112/).first()).toBeVisible();
  });
});

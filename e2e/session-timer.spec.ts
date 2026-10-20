import { expect, test } from "@playwright/test";
import { ALICE, signInAs, signInAsCustomer } from "./auth-helpers";
import { ARUN, e2eDb } from "./fixtures";

/**
 * The trainer's visible countdown, driven by the server-persisted start/end times: it appears on
 * Start, survives a refresh, ignores a wrong device clock, and the customer sees "In progress".
 */
const db = e2eDb();
const ZONE = "e2e_zone_main";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only spec");
});

test("trainer countdown is server-backed: refresh and device clock skew don't change it", async ({
  page,
  browser,
}) => {
  const startAt = new Date(Date.now() + 5 * 60_000); // the start window opens 15 minutes early
  const booking = await db.booking.create({
    data: {
      reference: "ZY-TIMER",
      customerId: ALICE.id,
      trainerId: ARUN.id,
      serviceZoneId: ZONE,
      mode: "INSTANT",
      status: "CONFIRMED",
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60_000),
      workoutCategory: "STRENGTH",
      pricingRuleId: "e2e_normal",
      isPeak: false,
      sessionPrice: "399.00",
      commissionPercent: "10.00",
      commissionAmount: "39.90",
      totalAmount: "438.90",
    },
  });

  await signInAs(page, ARUN.email, "Trainer");
  await page.goto(`/trainer/sessions/${booking.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Start session/ }).click();

  const timer = page.getByRole("timer", { name: "Time remaining" });
  await expect(timer).toBeVisible();
  await expect(timer).toHaveText(/^(60:00|59:[0-5]\d)$/);

  const record = await db.sessionRecord.findUniqueOrThrow({ where: { bookingId: booking.id } });
  expect(record.endsAt.getTime() - record.startedAt.getTime()).toBe(60 * 60_000);

  // Refresh: the persisted record is re-read, the countdown continues (is not reset to 60:00).
  await page.waitForTimeout(3000);
  await page.reload();
  await expect(timer).toHaveText(/^59:[0-5]\d$/);
  const afterReload = await db.sessionRecord.findUniqueOrThrow({ where: { bookingId: booking.id } });
  expect(afterReload.startedAt.getTime()).toBe(record.startedAt.getTime());

  // A device clock two hours fast must not move the deadline: the page uses the server's clock.
  const skewed = await browser.newContext();
  const skewedPage = await skewed.newPage();
  await skewedPage.addInitScript(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 2 * 3_600_000;
  });
  await signInAs(skewedPage, ARUN.email, "Trainer");
  await skewedPage.goto(`/trainer/sessions/${booking.id}`);
  await expect(skewedPage.getByRole("timer", { name: "Time remaining" })).toHaveText(/^59:[0-5]\d$/);
  await skewed.close();

  // The customer sees the persisted status.
  const customerPage = await (await browser.newContext()).newPage();
  await signInAsCustomer(customerPage);
  await customerPage.goto(`/customer/bookings/${booking.id}`);
  await expect(customerPage.getByText("In progress").first()).toBeVisible();
});

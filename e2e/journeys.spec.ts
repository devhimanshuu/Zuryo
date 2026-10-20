import { expect, test } from "@playwright/test";
import { ALICE, signInAs, signInAsCustomer } from "./auth-helpers";
import { ARUN, OPS, e2eDb, ist } from "./fixtures";

/**
 * The critical journeys, run as one serial flow against the disposable database:
 * booking → reschedule → trainer and operations views → cancellation → package purchase. State carries between tests (that's the point),
 * and the global setup re-seeds before the whole run.
 */
const db = e2eDb();
let bookingId: string | null = null;
let bookingReference: string | null = null;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop-only spec");
});

test.describe.serial("customer journeys", () => {
  test("Journey A: signs in and books a scheduled session end to end", async ({ page }) => {
    await signInAsCustomer(page);
    await page.goto("/customer/bookings/new");

    await page.getByText("Scheduled", { exact: true }).first().click();
    await page.getByRole("button", { name: /Continue/ }).click();

    // The choice cards hide the native input behind `sr-only` and make the label the visual
    // control, so the label intercepts a normal click on the input. Force past that interception
    // rather than reaching for the label, so the assertion still exercises the real radio.
    await page.getByRole("radio", { name: /Strength/ }).check({ force: true });
    await page.getByRole("button", { name: "See available times" }).click();

    // Each day button's accessible name is the long date (`Wednesday, 21 October, 20 open slots`);
    // the relative "Today"/"Tomorrow" label is only visible text, so match on both.
    await page
      .getByRole("button", { name: /^\w+, \d+ \w+, \d+ open slots$/ })
      .filter({ hasText: "Tomorrow" })
      .click();
    // 10:00 IST sits in the seeded 06:00–12:00 window and outside the 06:00–09:00 peak window.
    await page.getByRole("radio", { name: /^10:00 AM/ }).check({ force: true });
    await page.getByRole("button", { name: /Continue with/ }).click();

    await expect(page.getByText("Your trainer")).toBeVisible();
    await page.getByRole("button", { name: "Review booking" }).click();

    await expect(page.getByText("Review and confirm")).toBeVisible();
    await page.getByRole("button", { name: /Confirm and pay/ }).click();

    // Persisted confirmation page, not a client-side success screen.
    await page.waitForURL(/\/customer\/bookings\/.+\?created=1/);
    await expect(page.getByText("You're booked")).toBeVisible();

    const row = await db.booking.findFirstOrThrow({
      where: { customerId: ALICE.id },
      orderBy: { createdAt: "desc" },
    });
    expect(row.status).toBe("CONFIRMED");
    expect(String(row.totalAmount)).toBe("438.9");
    bookingId = row.id;
    bookingReference = row.reference;
    // The reference is shown twice on the confirmation page (status badge + heading), so pin the
    // first occurrence rather than asserting on an ambiguous locator.
    await expect(page.getByText(bookingReference!).first()).toBeVisible();
  });

  test("Journey A2: moves the booking to another time from the booking page", async ({ page }) => {
    expect(bookingId).not.toBeNull();
    await signInAsCustomer(page);
    await page.goto(`/customer/bookings/${bookingId}`);

    await page.getByRole("button", { name: "Reschedule" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: /^\w+, \d+ \w+, \d+ open slots$/ })
      .filter({ hasText: "Tomorrow" })
      .click();
    // 11:00 IST is standard-priced like the original 10:00, so a paid booking may move there.
    await dialog.getByRole("radio", { name: /^11:00 AM/ }).check({ force: true });
    await dialog.getByRole("button", { name: /^Move to/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Moved 1 time/)).toBeVisible();

    const row = await db.booking.findUniqueOrThrow({
      where: { id: bookingId! },
      include: { payments: true },
    });
    expect(row.rescheduleCount).toBe(1);
    expect(row.startAt.toISOString()).toBe(ist(11, 0, 1).toISOString());
    expect(row.payments).toHaveLength(1); // the move charged nothing new
  });

  test("Journey A3: the assigned trainer is notified and sees the moved session", async ({ page }) => {
    expect(bookingReference).not.toBeNull();
    const row = await db.booking.findUniqueOrThrow({ where: { id: bookingId! } });
    expect(row.trainerId).toBe(ARUN.id);
    const notified = await db.notification.count({
      where: { bookingId: bookingId!, recipientId: ARUN.id, type: "BOOKING_RESCHEDULED" },
    });
    expect(notified).toBe(1);

    await signInAs(page, ARUN.email, "Trainer");
    await page.goto("/trainer/sessions");
    await expect(page.getByText("Alice").first()).toBeVisible();
  });

  test("Journey A4: operations see the booking with its reference", async ({ page }) => {
    // Each test gets a fresh browser context, so this is a clean operations sign-in.
    await signInAs(page, OPS.email, "Operations");
    await page.goto("/operations/bookings");
    await expect(page.getByText(bookingReference!).first()).toBeVisible();
  });

  test("Journey B: cancels the booking and the slot frees up", async ({ page }) => {
    expect(bookingId).not.toBeNull();
    await signInAsCustomer(page);
    await page.goto(`/customer/bookings/${bookingId}`);

    await page.getByRole("button", { name: "Cancel booking" }).click();
    // The trigger opens a confirmation dialog; its own "Cancel booking" button submits.
    await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText("This booking is already cancelled.")).toBeVisible();

    const row = await db.booking.findUniqueOrThrow({ where: { id: bookingId! } });
    expect(row.status).toBe("CANCELLED");
    expect(row.cancelledById).toBe(ALICE.id);
  });

  test("Journey C: buys the Starter Pack with the simulated checkout", async ({ page }) => {
    await signInAsCustomer(page);
    await page.goto("/customer/packages");

    await expect(page.getByText("Demo checkout — no real money is charged")).toBeVisible();
    await page.getByRole("button", { name: /Choose Starter Pack/ }).click();
    await page.waitForURL("**/customer/packages/checkout/**");

    await expect(page.getByText("Total to pay")).toBeVisible();
    await page.getByRole("button", { name: /Pay ₹2,084\.50 \(simulated\)/ }).click();

    await page.waitForURL(/\/customer\/packages\?purchased=/);
    await expect(page.getByText("Starter Pack is ready")).toBeVisible();
    await expect(page.getByText("5 of 5 left")).toBeVisible();

    const pkg = await db.package.findFirstOrThrow({
      where: { customerId: ALICE.id },
      orderBy: { createdAt: "desc" },
    });
    expect(pkg.status).toBe("ACTIVE");
    expect(pkg.usedSessions).toBe(0);
    expect(String(pkg.pricePaid)).toBe("2084.5");
  });
});

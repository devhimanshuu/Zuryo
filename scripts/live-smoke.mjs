// Browser smoke test against a DEPLOYED Zuryo. Writes one synthetic booking (then cancels it) using the
// seeded demo accounts, so only run it against a demo database.
//   node scripts/live-smoke.mjs https://your-app.vercel.app
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) throw new Error("usage: node scripts/live-smoke.mjs <base-url>");
const PASSWORD = "password123";
const oneLine = (text) => String(text).replace(/\s+/g, " ").slice(0, 500);
const results = [];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(["PASS", name, detail ?? ""]);
  } catch (e) {
    results.push(["FAIL", name, oneLine(e.message)]);
    throw e;
  }
};

const browser = await chromium.launch();
const newPage = async () => (await browser.newContext({ baseURL: base })).newPage();
const signIn = async (page, email, workspace) => {
  await page.goto("/sign-in");
  await page.getByRole("radio", { name: workspace }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**/${workspace.toLowerCase()}`);
};
let bookingUrl = null;
let customer = null;
try {
  customer = await newPage();
  await step("customer signs in", () => signIn(customer, "priya.sharma@demo.zuryo.example", "Customer"));
  await step("scheduled booking: category, tomorrow, standard slot, review, confirm", async () => {
    await customer.goto("/customer/bookings/new");
    await customer.waitForLoadState("networkidle");
    await customer.getByText("Scheduled", { exact: true }).first().click();
    await customer.getByRole("button", { name: /Continue/ }).click();
    await customer.getByRole("radio", { name: /Strength/ }).check({ force: true });
    await customer.getByRole("button", { name: "See available times" }).click();
    await customer
      .getByRole("button", { name: /^\w+, \d+ \w+, \d+ open slots$/ })
      .filter({ hasText: "Tomorrow" })
      .click();
    // First free standard-priced (non-peak) slot, so reruns and earlier bookings never collide.
    await customer
      .getByRole("radio", { name: /^\d+:\d\d (AM|PM)\s*, ₹/, disabled: false })
      .first()
      .check({ force: true });
    await customer.getByRole("button", { name: /Continue with/ }).click();
    await customer.getByText("Your trainer").waitFor();
    await customer.getByRole("button", { name: "Review booking" }).click();
    await customer.getByText("Review and confirm").waitFor();
    const text = await customer.locator("body").innerText();
    if (!text.includes("438.90")) throw new Error("review screen does not show the 438.90 standard total");
    if (!text.includes("39.90")) throw new Error("review screen does not show the 39.90 commission");
    await customer.getByRole("button", { name: /Confirm (and pay|with package)/ }).click();
    await customer.waitForURL(/\/customer\/bookings\/.+\?created=1/, { timeout: 60000 });
    await customer.getByText("You're booked").waitFor();
    bookingUrl = customer.url().split("?")[0];
    return `399.00 + 39.90 = 438.90 shown; booking ${bookingUrl.split("/").pop()}`;
  });
  await step("booking persisted in customer history", async () => {
    await customer.goto("/customer/bookings");
    await customer
      .getByText(/Confirmed/i)
      .first()
      .waitFor();
  });
  await step("packages page shows the simulated-checkout label", async () => {
    await customer.goto("/customer/packages");
    await customer.getByText("Demo checkout — no real money is charged").waitFor();
  });
  await step("fitness page loads", async () => {
    await customer.goto("/customer/fitness");
    await customer.getByRole("heading").first().waitFor();
  });
  const ops = await newPage();
  await step("operations signs in and sees the pricing configuration", async () => {
    await signIn(ops, "neha.kapoor@demo.zuryo.example", "Operations");
    await ops.goto("/operations/pricing");
    await ops.waitForLoadState("networkidle");
    const values = (await ops.locator("input").evaluateAll((els) => els.map((e) => e.value))).join(" ");
    const text = values + " " + (await ops.locator("body").innerText());
    if (!/399/.test(text) || !/499/.test(text)) throw new Error("pricing config missing 399/499");
  });
  const trainer = await newPage();
  await step("trainer signs in and opens sessions", async () => {
    await signIn(trainer, "arjun.mehta@demo.zuryo.example", "Trainer");
    await trainer.goto("/trainer/sessions");
    await trainer.getByRole("heading").first().waitFor();
  });
} catch (e) {
  console.error("aborted:", oneLine(e.message));
} finally {
  // Always undo the smoke booking, even when an earlier step failed.
  if (bookingUrl && customer) {
    try {
      await step("customer cancels the smoke booking (slot freed)", async () => {
        await customer.goto(bookingUrl);
        await customer.getByRole("button", { name: "Cancel booking" }).click();
        await customer.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
        await customer.getByText("This booking is already cancelled.").waitFor({ timeout: 60000 });
      });
    } catch {}
  }
  await browser.close();
  for (const [s, n, d] of results) console.log(`${s} ${n}${d ? " — " + d : ""}`);
  process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
}

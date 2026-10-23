// Responsive audit: logs in as each role, visits every page at many viewport sizes and reports
// horizontal overflow, elements poking out of the viewport, and undersized touch targets.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3200";
const VIEWPORTS = [
  [320, 568],
  [375, 812],
  [414, 896],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
];
const ROLES = {
  c: {
    email: "priya.sharma@demo.zuryo.example",
    role: "CUSTOMER",
    pages: [
      "/customer",
      "/customer/bookings",
      "/customer/bookings/new",
      "/customer/packages",
      "/customer/fitness",
      "/customer/fitness?tab=history",
      "/customer/fitness?tab=profile",
      "/customer/notifications",
      "/customer/account",
    ],
  },
  t: {
    email: "arjun.mehta@demo.zuryo.example",
    role: "TRAINER",
    pages: [
      "/trainer",
      "/trainer/sessions",
      "/trainer/availability",
      "/trainer/notifications",
      "/trainer/account",
    ],
  },
  o: {
    email: "neha.kapoor@demo.zuryo.example",
    role: "OPERATIONS",
    pages: [
      "/operations",
      "/operations/bookings",
      "/operations/trainers",
      "/operations/pricing",
      "/operations/account",
    ],
  },
};
const PUBLIC = ["/", "/how-it-works", "/sign-in", "/sign-in/operator", "/sign-up"];

async function login(browser, who) {
  const ctx = await browser.newContext();
  const csrf = await (await ctx.request.get(`${BASE}/api/auth/csrf`)).json();
  await ctx.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: {
      csrfToken: csrf.csrfToken,
      email: who.email,
      password: "password123",
      role: who.role,
      json: "true",
    },
  });
  return ctx;
}

const measure = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.closest("[hidden]") || el.closest(".sr-only")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // ignore content inside an element that scrolls on purpose
    let p = el.parentElement,
      scrolls = false;
    while (p && p !== document.body) {
      const o = getComputedStyle(p).overflowX;
      if ((o === "auto" || o === "scroll" || o === "hidden") && p.getBoundingClientRect().right <= vw + 1) {
        scrolls = true;
        break;
      }
      p = p.parentElement;
    }
    if (!scrolls && (r.right > vw + 1 || r.left < -1))
      out.push(
        `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} [${Math.round(r.left)}..${Math.round(r.right)}]`,
      );
  }
  const small = [
    ...document.querySelectorAll(
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button]",
    ),
  ]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== "hidden" &&
        !e.closest(".sr-only") &&
        (r.height < 32 || r.width < 32) &&
        !(e.tagName === "INPUT" && (e.type === "checkbox" || e.type === "radio"))
      );
    })
    .slice(0, 5)
    .map(
      (e) =>
        `${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`,
    );
  return {
    hscroll: de.scrollWidth > vw + 1,
    sw: de.scrollWidth,
    vw,
    out: [...new Set(out)].slice(0, 6),
    small,
  };
};

const browser = await chromium.launch();
const issues = [];
let checked = 0;
async function audit(ctx, path) {
  const page = await ctx.newPage();
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(700); // entrance animations
    const m = await page.evaluate(measure);
    checked++;
    if (m.hscroll || m.out.length)
      issues.push({
        path,
        w,
        kind: "overflow",
        detail: `scrollWidth ${m.sw} > ${m.vw}; ${m.out.join(" | ")}`,
      });
    if (w <= 414 && m.small.length >= 1) issues.push({ path, w, kind: "touch", detail: m.small.join(" | ") });
  }
  await page.close();
}
const anon = await browser.newContext();
for (const p of PUBLIC) await audit(anon, p);
for (const who of Object.values(ROLES)) {
  const ctx = await login(browser, who);
  for (const p of who.pages) await audit(ctx, p);
  await ctx.close();
}
await browser.close();
console.log(`checked ${checked} page/viewport combinations`);
const grouped = {};
for (const i of issues) (grouped[`${i.kind} ${i.path}`] ??= []).push(`${i.w}px: ${i.detail}`);
for (const [k, v] of Object.entries(grouped))
  console.log(
    `\n${k}\n  ${v.slice(0, 4).join("\n  ")}${v.length > 4 ? `\n  …+${v.length - 4} more widths` : ""}`,
  );
if (!issues.length) console.log("no issues");

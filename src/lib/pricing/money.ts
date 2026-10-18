/**
 * Money helpers. Amounts travel as decimal strings ("399.00") from the database and are converted
 * to integer paise for arithmetic, so no floating-point value ever decides what someone pays.
 */
const DECIMAL_RE = /^(\d{1,8})(?:\.(\d{1,2}))?$/;

export function toPaise(amount: string | number | { toString(): string }): number {
  const text = typeof amount === "number" ? amount.toFixed(2) : amount.toString();
  const m = DECIMAL_RE.exec(text.trim());
  if (!m) throw new Error(`Not a valid INR amount: "${text}"`);
  const rupees = Number(m[1]);
  const paise = Number((m[2] ?? "").padEnd(2, "0"));
  return rupees * 100 + paise;
}

export function fromPaise(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error(`Invalid paise amount: ${paise}`);
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

/** Percent string with up to two decimals ("10", "10.00", "12.5") → basis points (1000, 1000, 1250). */
export function toBasisPoints(percent: string | number | { toString(): string }): number {
  return toPaise(percent); // same fixed-point shape: two decimals
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "438.90" → "₹438.90". Accepts Prisma Decimal, decimal strings or paise (with `{ paise: true }`). */
export function formatINR(
  amount: string | number | { toString(): string },
  opts?: { paise?: boolean },
): string {
  const paise = opts?.paise ? Number(amount) : toPaise(amount);
  return inr.format(paise / 100);
}

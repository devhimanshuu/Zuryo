import { formatINR } from "@/lib/pricing";

/** One line explaining how a booking is paid for, derived only from persisted records. */
export type Coverage = { label: string; tone: "brand" | "success" | "danger" | "muted" };

export function coverageSummary(b: {
  status: string;
  package?: { name: string } | null;
  payments?: Array<{ status: string; amount: { toString(): string } }>;
  packageEntries?: Array<{ reason: string }>;
}): Coverage {
  if (b.package) {
    const restored = b.packageEntries?.some((e) => e.reason === "CANCELLATION_REFUND");
    return restored
      ? { label: `Session returned to ${b.package.name}`, tone: "muted" }
      : { label: `1 session from ${b.package.name}`, tone: "brand" };
  }
  const p = b.payments?.[0];
  if (!p) return { label: "No payment recorded", tone: "muted" };
  switch (p.status) {
    case "SUCCEEDED":
      return { label: `Paid ${formatINR(p.amount)} (simulated)`, tone: "success" };
    case "REFUNDED":
      return { label: `Refunded ${formatINR(p.amount)} (simulated)`, tone: "muted" };
    case "FAILED":
      return { label: "Payment declined (simulated)", tone: "danger" };
    default:
      return { label: "Payment pending", tone: "muted" };
  }
}

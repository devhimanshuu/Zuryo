import { auth } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { normalizeQuery, parseBookingSort, parseBookingStatus } from "@/lib/operations-filters";
import { coverageSummary } from "@/lib/payments/coverage";
import { formatSlot, titleCase } from "@/lib/utils/format";
import { getOperationsBookingsForExport } from "@/server/queries/operations";

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "OPERATIONS") {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filters = {
    q: normalizeQuery(searchParams.get("q") ?? undefined),
    status: parseBookingStatus(searchParams.get("status") ?? undefined),
    sort: parseBookingSort(searchParams.get("sort") ?? undefined),
  };
  const bookings = await getOperationsBookingsForExport(filters);

  const rows = [
    [
      "Reference",
      "Status",
      "Starts at (IST)",
      "Start (ISO)",
      "Mode",
      "Peak",
      "Customer",
      "Trainer",
      "Community",
      "Workout",
      "Paid with",
      "Total (INR)",
      "Payment status",
      "Cancellation reason",
    ],
    ...bookings.map((b) => [
      b.reference,
      titleCase(b.status),
      formatSlot(b.startAt),
      b.startAt.toISOString(),
      titleCase(b.mode),
      b.isPeak ? "Yes" : "No",
      b.customer.user.name,
      b.trainer?.user.name ?? "Unassigned",
      b.serviceZone.name,
      b.workoutCategory ? titleCase(b.workoutCategory) : "",
      coverageSummary(b).label,
      b.totalAmount.toFixed(2),
      b.payments.map((p) => titleCase(p.status)).join("; "),
      b.cancellationReason ?? "",
    ]),
  ];

  const filename = `zuryofit-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`\uFEFF${toCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

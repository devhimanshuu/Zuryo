import { categoryLabel } from "@/lib/booking/categories";
import { buildIcsEvent } from "@/lib/booking/ics";
import { formatINR } from "@/lib/pricing";
import { getActor } from "@/server/auth/actor";
import { getBookingForActor } from "@/server/booking/booking-service";
import { defaultDeps } from "@/server/booking/deps";

/** Downloads the signed-in customer's own booking as an .ics file. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let actor;
  try {
    actor = await getActor("CUSTOMER");
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const booking = await getBookingForActor(defaultDeps(), actor, id);
  if (!booking) return new Response("Not found", { status: 404 });

  const trainerLine = booking.trainer ? ` with ${booking.trainer.user.name}` : "";
  const location = `${booking.serviceZone.name}${booking.customer.addressLine ? `, ${booking.customer.addressLine}` : ""}`;
  const ics = buildIcsEvent({
    uid: `${booking.id}@zuryo`,
    title: `${categoryLabel(booking.workoutCategory)}${trainerLine}`,
    start: booking.startAt,
    end: booking.endAt,
    description: `Zuryo booking ${booking.reference} · 60-minute session · ${formatINR(booking.totalAmount)} (simulated payment)`,
    location,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="zuryo-${booking.reference}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

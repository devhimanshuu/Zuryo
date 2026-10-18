import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { BookingWizard } from "@/features/bookings/wizard/booking-wizard";
import { safely } from "@/lib/utils/errors";
import { bookingModeSchema } from "@/lib/validation/enums";
import { getActor } from "@/server/auth/actor";
import { getBookingSetup } from "@/server/queries/customer";

export const metadata: Metadata = { title: "Book a session" };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const actor = await getActor("CUSTOMER");
  const result = await safely(() => getBookingSetup(actor.userId));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  if (!result.data) {
    return (
      <ErrorState
        title="Customer profile not found"
        message="This demo customer has no active profile. Run npm run db:seed, or switch demo user."
      />
    );
  }
  const { mode } = await searchParams;
  const initialMode = bookingModeSchema.safeParse(mode?.toUpperCase()).data ?? null;
  const { customer, categories } = result.data;

  return (
    <div>
      <Link
        href="/customer/bookings"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> My bookings
      </Link>
      <PageHeader
        editorial
        title="Book a session"
        description={`60 minutes with a trainer at ${customer.zoneName}. Booking as ${customer.name}.`}
      />
      <BookingWizard
        customer={{
          name: customer.name,
          zoneName: customer.zoneName,
          addressLine: customer.addressLine,
          timeZone: customer.timeZone,
        }}
        categories={categories}
        initialMode={initialMode}
      />
    </div>
  );
}

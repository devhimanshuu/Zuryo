import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { BookingWizard } from "@/features/bookings/wizard/booking-wizard";
import { safely } from "@/lib/utils/errors";
import { bookingModeSchema } from "@/lib/validation/enums";
import { getDb } from "@/lib/db";
import { getActor } from "@/server/auth/actor";
import { getRedeemablePackages } from "@/server/packages/package-service";
import { getBookingSetup } from "@/server/queries/customer";

export const metadata: Metadata = { title: "Book a session" };

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const actor = await getActor("CUSTOMER");
  const result = await safely(async () => {
    const [setup, packages] = await Promise.all([
      getBookingSetup(actor.userId),
      getRedeemablePackages(getDb(), actor.userId, new Date()),
    ]);
    return setup ? { ...setup, packages } : null;
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;
  if (!result.data) {
    return (
      <ErrorState
        title="Customer profile not found"
        message="This demo customer has no active profile. Run npm run db:seed, or sign in as another account."
      />
    );
  }
  const { mode } = await searchParams;
  const initialMode = bookingModeSchema.safeParse(mode?.toUpperCase()).data ?? null;
  const { customer, categories, packages } = result.data;

  return (
    <div>
      <PageHeader
        editorial
        back={{ href: "/customer/bookings", label: "My bookings" }}
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
        packages={packages}
        initialMode={initialMode}
      />
    </div>
  );
}

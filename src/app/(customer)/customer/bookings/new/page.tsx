import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { BookingWizard } from "@/features/bookings/wizard/booking-wizard";
import { safely } from "@/lib/utils/errors";
import { bookingModeSchema, workoutCategorySchema } from "@/lib/validation/enums";
import { getDb } from "@/lib/db";
import { getActor } from "@/server/auth/actor";
import { getRedeemablePackages } from "@/server/packages/package-service";
import { getBookingSetup } from "@/server/queries/customer";

export const metadata: Metadata = { title: "Book a session" };

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; category?: string }>;
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
  const { mode, category } = await searchParams;
  const initialMode = bookingModeSchema.safeParse(mode?.toUpperCase()).data ?? null;
  // A recommendation's "book this" link carries the category; anything invalid is simply ignored
  // and the customer picks as usual. The wizard and the booking service validate again.
  const initialCategory = workoutCategorySchema.safeParse(category?.toUpperCase()).data ?? null;
  const { customer, categories, packages } = result.data;

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
        packages={packages}
        initialMode={initialMode}
        initialCategory={initialCategory}
      />
    </div>
  );
}

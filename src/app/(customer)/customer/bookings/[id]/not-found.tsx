import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function BookingNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Booking not found"
      body="It may belong to a different account, or the link is wrong. If you switched demo user, this booking belongs to someone else."
      action={
        <Button asChild variant="primary">
          <Link href="/customer/bookings">See my bookings</Link>
        </Button>
      }
    />
  );
}

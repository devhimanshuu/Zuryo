import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function CheckoutNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Checkout not found"
      body="It may belong to a different account. It may belong to a different account. Sign in as that account to see it."
      action={
        <Button asChild variant="primary">
          <Link href="/customer/packages">See packages</Link>
        </Button>
      }
    />
  );
}

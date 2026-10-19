import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function TrainerSessionNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Session not found"
      body="It isn't assigned to you. If you switched demo trainer, it belongs to someone else."
      action={
        <Button asChild variant="primary">
          <Link href="/trainer/sessions">See my sessions</Link>
        </Button>
      }
    />
  );
}

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="container-page grid min-h-[60dvh] place-items-center py-16 text-center">
      <div>
        <h1 className="font-display text-display-md">Something went wrong</h1>
        <p className="mt-2 text-ink-muted">Please try again. If it keeps happening, check the server logs.</p>
        <Button variant="primary" className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="container-page grid min-h-dvh place-items-center py-16 text-center">
      <div>
        <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase tabular">404</p>
        <h1 className="mt-2 font-display text-display-md">This page isn&apos;t here</h1>
        <p className="mt-2 text-ink-muted">The link may be old, or the page hasn&apos;t been built yet.</p>
        <Button asChild variant="primary" className="mt-6">
          <Link href="/">Back to Zuryo</Link>
        </Button>
      </div>
    </main>
  );
}

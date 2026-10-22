import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-16 text-center"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-brand-soft/80 blur-3xl" />
        <div className="absolute inset-0 bg-dot-grid fade-radial text-ink/[0.06]" />
      </div>
      <div className="grid animate-rise justify-items-center">
        <span
          className="grid size-14 place-items-center rounded-full bg-raised text-brand shadow-(--shadow-2)"
          aria-hidden
        >
          <Compass className="size-6" />
        </span>
        <p className="mt-6 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase tabular">
          404
        </p>
        <h1 className="mt-2 font-display text-display-md sm:text-display-lg">This page isn&apos;t here</h1>
        <p className="mt-2 max-w-sm text-ink-muted">
          The link may be old, or the page hasn&apos;t been built yet.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-8">
          <Link href="/">
            <ArrowLeft aria-hidden /> Back to Zuryo
          </Link>
        </Button>
      </div>
    </main>
  );
}

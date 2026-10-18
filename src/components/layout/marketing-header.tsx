import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/wordmark";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/#instant-or-scheduled", label: "Instant or scheduled" },
  { href: "/#for-trainers", label: "For trainers" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline/70 bg-surface/85 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-6">
        <Wordmark />
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex gap-6 text-sm font-semibold text-ink-muted">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href="/customer">Book a trainer</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

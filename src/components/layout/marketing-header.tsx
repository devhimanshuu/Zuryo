import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/wordmark";
import { MarketingMobileMenu } from "./marketing-mobile-menu";
import { ThemeControl } from "./theme-control";

export const MARKETING_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/#instant-or-scheduled", label: "Instant or scheduled" },
  { href: "/#for-trainers", label: "For trainers" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline/70 bg-surface/80 backdrop-blur-md">
      <div className="container-page flex h-16 items-center gap-8">
        <Wordmark />
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex gap-7 text-sm font-semibold text-ink-muted">
            {MARKETING_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="relative py-1 transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-ink after:transition-transform after:duration-200 hover:text-ink hover:after:scale-x-100"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:block">
            <ThemeControl />
          </div>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="primary" size="sm" className="group">
            <Link href="/customer/bookings/new">
              Book a trainer
              <ArrowRight
                className="hidden transition-transform duration-150 group-hover:translate-x-0.5 sm:block"
                aria-hidden
              />
            </Link>
          </Button>
          <MarketingMobileMenu links={MARKETING_LINKS} />
        </div>
      </div>
    </header>
  );
}

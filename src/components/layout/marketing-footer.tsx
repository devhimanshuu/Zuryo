import Link from "next/link";
import { Wordmark } from "@/components/shared/wordmark";

export function MarketingFooter() {
  return (
    <footer className="bg-inverse text-ink-inverse">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark inverse />
          <p className="mt-3 max-w-xs text-body-sm text-ink-inverse/75">
            Personal training in your residential community, booked in minutes.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { href: "/how-it-works", label: "How it works" },
            { href: "/#instant-or-scheduled", label: "Instant or scheduled" },
            { href: "/sign-in", label: "Customer workspace" },
          ]}
        />
        <FooterCol
          title="Partners"
          links={[
            { href: "/#for-trainers", label: "For trainers" },
            { href: "/sign-in", label: "Trainer workspace" },
            { href: "/sign-in", label: "Operations workspace" },
          ]}
        />
        <FooterCol title="Account" links={[{ href: "/sign-in", label: "Sign in" }]} />
      </div>
      <div className="container-page flex flex-wrap justify-between gap-2 border-t border-ink-inverse/15 py-5 text-body-sm text-ink-inverse/70">
        <p>© {new Date().getFullYear()} Zuryo. A product demo with synthetic data.</p>
        <p>Photography via Unsplash.</p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-inverse/70 uppercase">{title}</p>
      <ul className="mt-3 grid gap-2 text-sm">
        {links.map((l) => (
          <li key={`${l.href}-${l.label}`}>
            <Link href={l.href} className="text-ink-inverse/90 hover:text-ink-inverse hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

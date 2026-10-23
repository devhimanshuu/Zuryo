import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** No logo mark exists yet; the name set in the display face is the wordmark. */
export function Wordmark({
  href = "/",
  className,
  inverse,
}: {
  href?: string;
  className?: string;
  inverse?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-display text-[1.75rem] leading-none tracking-tight",
        inverse ? "text-ink-inverse" : "text-ink",
        className,
      )}
      aria-label="ZuryoFit home"
    >
      ZuryoFit
    </Link>
  );
}

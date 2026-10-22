import { cn } from "@/lib/utils/cn";
import { initials } from "@/lib/utils/format";

const SIZE = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
} as const;

const TONE = {
  brand: "bg-brand-soft text-brand",
  accent: "bg-accent-soft text-accent-text",
  neutral: "bg-sunken text-ink-muted",
  inverse: "bg-ink-inverse/10 text-ink-inverse",
} as const;

/** Initials in a tinted circle. Decorative: the person's name is always shown as text next to it. */
export function Avatar({
  name,
  size = "md",
  tone = "brand",
  className,
}: {
  name: string;
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold tracking-tight ring-1 ring-current/10 ring-inset",
        SIZE[size],
        TONE[tone],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

import { cn } from "@/lib/utils/cn";

type Variant = "empty" | "success" | "error";

/**
 * Small hand-drawn spot illustrations. They are decorative only (aria-hidden) and inherit the
 * surrounding text colour, so the same drawing works in light and dark themes.
 */
export function SpotIllustration({ variant = "empty", className }: { variant?: Variant; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 100"
      fill="none"
      aria-hidden
      focusable="false"
      className={cn("text-brand", className)}
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        {variant === "empty" ? (
          <>
            <path
              d="M42 76c-11-6-16-20-9-31 8-13 25-16 39-15 15 1 31 6 44 17 11 9 17 25 7 33-10 8-29 5-42 3-14-2-28-1-39-7Z"
              className="fill-brand-soft/70 stroke-none"
            />
            <path
              d="M50 71c-8-8-8-23 2-30 9-6 24-5 32-1 9 5 15 16 11 25-4 8-17 12-27 11-7-1-13-2-18-5Z"
              stroke="currentColor"
              strokeWidth="1.4"
              opacity="0.3"
            />
            <path
              d="M51 72c-9-8-9-23 1-30 10-6 24-5 33-1"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.55"
            />
            <path d="M28 34c-4-4-4-10 0-14 4-3 9-2 12 1" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
            <path d="M132 64c4 3 5 8 2 12-3 3-8 2-10-1" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
            <path d="M127 26v8M123 30h8" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
            <path d="M34 62v6M31 65h6" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
            <circle cx="120" cy="77" r="2" className="fill-accent/60 stroke-none" />
            <circle cx="43" cy="27" r="2.2" className="fill-brand/50 stroke-none" />
            <path d="M71 86c6 3 14 3 21 0" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
          </>
        ) : null}

        {variant === "success" ? (
          <>
            <path
              d="M34 74c-10-7-13-21-5-31 8-11 24-14 37-13 14 1 27 6 38 16 10 9 14 24 4 31-11 8-27 4-40 3-12-1-25 1-34-6Z"
              className="fill-success-soft/80 stroke-none"
            />
            <path
              d="M48 69c-8-7-8-21 2-27 10-6 23-5 31-1 9 4 14 14 11 22-4 8-16 11-26 10-7 0-13-1-18-4Z"
              stroke="currentColor"
              strokeWidth="1.6"
              opacity="0.4"
            />
            <path d="M42 22c-3-5 0-10 5-11 5 0 8 4 7 8-1 5-8 8-12 3Z" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
            <path d="M126 18v7M122.5 21.5h7" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
            <path d="M142 47v5M139.5 49.5h5" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
            <path d="M113 75l5 5M118 75l-5 5" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
            <path d="M28 52c4-2 8 0 9 4" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
            <circle cx="52" cy="82" r="2" className="fill-accent/60 stroke-none" />
            <circle cx="119" cy="34" r="1.8" className="fill-brand/50 stroke-none" />
            <path d="M70 88c7 3 15 3 22 0" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          </>
        ) : null}

        {variant === "error" ? (
          <>
            <path
              d="M37 75c-10-7-13-21-5-31 9-11 25-13 38-12 13 1 26 7 36 17 9 9 12 23 2 30-11 7-26 3-39 2-11-1-24 0-32-6Z"
              className="fill-danger-soft/70 stroke-none"
            />
            <path
              d="M57 36c-8 4-12 15-8 23 4 9 15 13 24 9 9-3 14-13 11-22-3-8-12-13-21-11"
              stroke="currentColor"
              strokeWidth="1.6"
              opacity="0.5"
            />
            <path d="M79 38l-4 13" stroke="currentColor" strokeWidth="2.4" />
            <path d="M76 60l-.6 3" stroke="currentColor" strokeWidth="2.4" />
            <path d="M42 26c-3-4-1-8 3-9 4-1 6 2 6 5 0 4-6 7-9 4Z" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            <path d="M128 32l-5 7M128 32l1 8" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
            <path d="M35 56c3-3 7-3 9 0" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
            <circle cx="124" cy="70" r="2" className="fill-accent/50 stroke-none" />
            <circle cx="45" cy="80" r="1.8" className="fill-danger/40 stroke-none" />
            <path d="M68 85c7 3 15 3 22-1" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          </>
        ) : null}
      </g>
    </svg>
  );
}

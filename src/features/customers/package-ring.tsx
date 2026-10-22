export function PackageRing({ total, used, size = 96 }: { total: number; used: number; size?: number }) {
  const clamped = Math.min(Math.max(used, 0), Math.max(total, 0));
  const remaining = Math.max(0, total - clamped);
  const fraction = total > 0 ? clamped / total : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={clamped}
      aria-valuetext={`${clamped} of ${total} sessions used, ${remaining} remaining`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          stroke="currentColor"
          className="text-sunken"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          stroke="currentColor"
          className="text-brand transition-[stroke-dashoffset] duration-500"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="text-center">
          <span className="block font-display text-heading-lg leading-none tabular">{remaining}</span>
          <span className="mt-0.5 block text-[10px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
            left
          </span>
        </span>
      </span>
    </div>
  );
}

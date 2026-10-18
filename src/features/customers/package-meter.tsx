export function PackageMeter({ name, total, used }: { name: string; total: number; used: number }) {
  const remaining = total - used;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{name}</p>
        <p className="text-body-sm text-ink-muted tabular">
          {used} of {total} used
        </p>
      </div>
      <p className="mt-2 text-numeric-lg font-semibold tracking-tight tabular">
        {remaining} <span className="text-body-md font-normal text-ink-muted">sessions left</span>
      </p>
      <div
        className="mt-3 flex gap-1"
        role="meter"
        aria-label="Package sessions used"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={used}
        aria-valuetext={`${used} of ${total} sessions used, ${remaining} remaining`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={i < used ? "h-2 flex-1 rounded-full bg-brand" : "h-2 flex-1 rounded-full bg-sunken"}
          />
        ))}
      </div>
    </div>
  );
}

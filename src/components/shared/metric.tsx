import { cn } from "@/lib/utils/cn";

export function Metric({
  label,
  value,
  foot,
  alert,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-raised px-5 py-4">
      <p className="text-body-sm font-semibold text-ink-muted">{label}</p>
      <p className={cn("mt-1 text-numeric-lg font-semibold tracking-tight tabular", alert && "text-warning")}>
        {value}
      </p>
      {foot ? <p className="mt-1 text-body-sm text-ink-muted">{foot}</p> : null}
    </div>
  );
}

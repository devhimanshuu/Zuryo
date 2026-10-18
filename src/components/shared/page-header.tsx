import { cn } from "@/lib/utils/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  editorial,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Customer screens use the display serif; operational workspaces use the sans heading. */
  editorial?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 pb-6", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={
            editorial ? "font-display text-display-md" : "text-heading-lg font-semibold tracking-tight"
          }
        >
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-body-md text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

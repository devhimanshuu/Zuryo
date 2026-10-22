import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export type Crumb = { href?: string; label: React.ReactNode };

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  editorial,
  back,
  breadcrumbs,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Customer screens use the display serif; operational workspaces use the sans heading. */
  editorial?: boolean;
  /** Link back to the parent list, shown above the title. */
  back?: { href: string; label: string };
  /** Optional trail above the title; the last item is the current page. */
  breadcrumbs?: Crumb[];
  className?: string;
}) {
  return (
    <header className={cn("grid gap-3 pb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm font-semibold text-ink-muted">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={i} className="flex min-w-0 items-center gap-1">
                  {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-ink-subtle" aria-hidden /> : null}
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className="truncate hover:text-ink">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={isLast ? "page" : undefined}
                      className={cn("truncate", isLast && "text-ink")}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : back ? (
        <Link
          href={back.href}
          className="group inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft
            className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5"
            aria-hidden
          />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1.5 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
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
          {description ? <p className="mt-1.5 max-w-2xl text-body-md text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

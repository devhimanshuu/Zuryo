import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { pageHref, pageWindow, type PageMeta, type SearchParamsRecord } from "@/lib/pagination";

type PaginationProps = {
  pathname: string;
  searchParams?: SearchParamsRecord;
  result: PageMeta;
  itemLabel?: string;
  className?: string;
};

/**
 * Server-rendered pagination: real links, a visible range, and the current page announced to
 * assistive technology. Nothing renders when there is only one page.
 */
export function Pagination({
  pathname,
  searchParams = {},
  result,
  itemLabel = "results",
  className,
}: PaginationProps) {
  if (result.total === 0 || result.totalPages <= 1) return null;

  const hrefFor = (page: number) => pageHref(pathname, searchParams, page);
  const arrow = buttonVariants({ variant: "secondary", size: "sm" });
  const numberClass = buttonVariants({ variant: "ghost", size: "sm" });

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "mt-6 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-body-sm text-ink-muted">
        Showing{" "}
        <span className="font-semibold text-ink tabular-nums">
          {result.from}–{result.to}
        </span>{" "}
        of <span className="font-semibold text-ink tabular-nums">{result.total}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-1.5">
        {result.hasPrevious ? (
          <Link href={hrefFor(result.page - 1)} aria-label="Previous page" className={cn(arrow, "px-2")}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span aria-disabled="true" className={cn(arrow, "pointer-events-none px-2 opacity-40")}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </span>
        )}

        <ol className="hidden items-center gap-1 sm:flex">
          {pageWindow(result.page, result.totalPages).map((entry, index) =>
            entry === "gap" ? (
              <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-body-sm text-ink-muted">
                …
              </li>
            ) : (
              <li key={entry}>
                <Link
                  href={hrefFor(entry)}
                  aria-label={`Page ${entry}`}
                  aria-current={entry === result.page ? "page" : undefined}
                  className={cn(
                    numberClass,
                    "min-w-8 justify-center px-2 tabular-nums",
                    entry === result.page && "text-canvas hover:text-canvas bg-ink hover:bg-ink",
                  )}
                >
                  {entry}
                </Link>
              </li>
            ),
          )}
        </ol>

        <span className="px-1 text-body-sm text-ink-muted tabular-nums sm:hidden">
          {result.page} / {result.totalPages}
        </span>

        {result.hasNext ? (
          <Link href={hrefFor(result.page + 1)} aria-label="Next page" className={cn(arrow, "px-2")}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span aria-disabled="true" className={cn(arrow, "pointer-events-none px-2 opacity-40")}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}

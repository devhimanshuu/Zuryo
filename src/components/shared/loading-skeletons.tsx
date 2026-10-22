import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

export function PageSkeleton({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn("grid gap-6", className)}
    >
      {children}
    </div>
  );
}

export function HeaderSkeleton({ editorial = false }: { editorial?: boolean }) {
  return (
    <div className="grid gap-2 pb-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className={editorial ? "h-10 w-64" : "h-8 w-56"} />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-1)"
        >
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="grid min-w-0 flex-1 gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 4, className }: { cards?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="grid gap-3 rounded-lg border border-hairline bg-raised p-5 shadow-(--shadow-1)">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="mt-2 h-24 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-raised shadow-(--shadow-1)">
      <div className="flex gap-4 border-b border-hairline bg-sunken/60 px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-hairline px-4 py-4 last:border-0">
          {Array.from({ length: columns }, (_, j) => (
            <Skeleton key={j} className={cn("h-4 flex-1", j === 0 && "max-w-24")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="grid content-start gap-5">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
      <div className="grid content-start gap-5">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  );
}

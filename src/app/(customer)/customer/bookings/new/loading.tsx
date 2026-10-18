import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading booking">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    </div>
  );
}

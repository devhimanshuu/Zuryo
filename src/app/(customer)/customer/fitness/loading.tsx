import { HeaderSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading your fitness profile">
      <HeaderSkeleton editorial />
      <div className="grid gap-8 xl:grid-cols-[340px_1fr]">
        <div className="grid content-start gap-5">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
        <div className="grid content-start gap-4">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-10 w-full max-w-md" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}

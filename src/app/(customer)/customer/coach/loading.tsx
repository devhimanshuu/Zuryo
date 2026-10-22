import { HeaderSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading your coach">
      <HeaderSkeleton editorial />
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <Skeleton className="ml-auto h-20 w-3/4 rounded-lg" />
        <Skeleton className="h-28 w-4/5 rounded-lg" />
        <Skeleton className="ml-auto h-16 w-2/3 rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </PageSkeleton>
  );
}

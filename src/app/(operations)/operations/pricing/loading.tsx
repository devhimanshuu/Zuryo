import { HeaderSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading pricing">
      <HeaderSkeleton />
      <div className="grid gap-4 rounded-lg border border-hairline bg-raised p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-40 rounded-md" />
        <Skeleton className="h-10 w-36" />
      </div>
    </PageSkeleton>
  );
}

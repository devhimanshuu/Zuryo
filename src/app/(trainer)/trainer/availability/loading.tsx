import { HeaderSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading availability">
      <HeaderSkeleton />
      <div className="grid gap-4 rounded-lg border border-hairline bg-raised p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-10 w-40" />
      </div>
    </PageSkeleton>
  );
}

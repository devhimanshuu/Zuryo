import { CardGridSkeleton, HeaderSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading trainers">
      <HeaderSkeleton />
      <Skeleton className="h-12 rounded-lg" />
      <CardGridSkeleton cards={6} />
    </PageSkeleton>
  );
}

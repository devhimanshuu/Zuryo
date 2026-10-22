import { HeaderSkeleton, PageSkeleton, TableSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading bookings">
      <HeaderSkeleton />
      <Skeleton className="h-12 rounded-lg" />
      <TableSkeleton rows={8} columns={7} />
    </PageSkeleton>
  );
}

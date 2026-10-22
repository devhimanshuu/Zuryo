import { HeaderSkeleton, ListSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading your bookings">
      <HeaderSkeleton editorial />
      <Skeleton className="h-9 w-full max-w-md rounded-md" />
      <ListSkeleton rows={4} />
    </PageSkeleton>
  );
}

import { HeaderSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading package checkout" className="mx-auto max-w-xl">
      <HeaderSkeleton editorial />
      <Skeleton className="h-52 rounded-lg" />
      <Skeleton className="h-12 rounded-md" />
    </PageSkeleton>
  );
}

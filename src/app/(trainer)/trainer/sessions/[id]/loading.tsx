import { DetailSkeleton, HeaderSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Loading session">
      <HeaderSkeleton />
      <DetailSkeleton />
    </PageSkeleton>
  );
}

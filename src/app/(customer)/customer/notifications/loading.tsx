import { HeaderSkeleton, ListSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Loading your updates">
      <HeaderSkeleton editorial />
      <ListSkeleton rows={6} />
    </PageSkeleton>
  );
}

import { CardGridSkeleton, HeaderSkeleton, PageSkeleton } from "@/components/shared/loading-skeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Loading your packages">
      <HeaderSkeleton editorial />
      <SkeletonSection />
    </PageSkeleton>
  );
}

function SkeletonSection() {
  return <CardGridSkeleton cards={4} className="lg:grid-cols-2" />;
}

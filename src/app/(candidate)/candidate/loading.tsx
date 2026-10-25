import { ListPageSkeleton } from "@/components/feedback/page-skeletons";

export default function Loading() {
  return <ListPageSkeleton label="Loading your interviews…" rows={2} />;
}

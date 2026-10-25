import { ListPageSkeleton } from "@/components/feedback/page-skeletons";

export default function Loading() {
  return <ListPageSkeleton label="Loading interviews…" rows={8} />;
}

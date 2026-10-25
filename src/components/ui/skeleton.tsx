import { cn } from "@/lib/utils";

/** Placeholder block shown while a page loads (pulses unless the user prefers reduced motion). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} {...props} />;
}

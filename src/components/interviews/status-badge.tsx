import { STATUS_TONE, statusLabel, type StatusTone } from "@/lib/interview/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Text colours are the 700/800 shades so every tone passes WCAG AA on its tinted background.
const TONE: Record<StatusTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-brand-50 text-brand-900",
  active: "bg-amber-50 text-amber-800",
  success: "bg-emerald-50 text-emerald-800",
  danger: "bg-red-50 text-red-700",
};

/** Interview status with a human label and a colour by state (draft, ready, in progress, done, expired). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(TONE[STATUS_TONE[status] ?? "neutral"], className)} data-status={status}>
      {statusLabel(status)}
    </Badge>
  );
}

import Image from "next/image";
import { cn } from "@/lib/utils";

/*
 * Proctra brand assets, derived from public/logo.png into public/brand/ (transparent background,
 * plus white variants for the dark candidate arena). Tiny PNGs: served as-is (unoptimized).
 */

/** The pixel mark alone (117 × 58), for headers next to the name. Decorative by default. */
export function BrandMark({ tone = "light", className, alt = "" }: { tone?: "light" | "dark"; className?: string; alt?: string }) {
  return (
    <Image
      src={tone === "dark" ? "/brand/proctra-mark-dark.png" : "/brand/proctra-mark.png"}
      alt={alt}
      width={117}
      height={58}
      unoptimized
      priority
      className={cn("h-5 w-auto", className)}
    />
  );
}

/** Full lockup: mark + PROCTRA wordmark + tagline (320 × 72). Use where it renders ≥ 48 px tall. */
export function BrandLogo({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <Image
      src={tone === "dark" ? "/brand/proctra-logo-dark.png" : "/brand/proctra-logo.png"}
      alt="Proctra: your interview assistant"
      width={320}
      height={72}
      unoptimized
      priority
      className={cn("h-14 w-auto", className)}
    />
  );
}

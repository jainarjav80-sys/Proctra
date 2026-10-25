import Image from "next/image";
import { cn } from "@/lib/utils";

/*
 * Proctra brand assets: vector SVGs in public/brand/ (black, plus white variants for the dark
 * candidate arena), sharp at any size. SVGs are served as-is (unoptimized).
 */

/** The pixel mark alone (6 × 3 grid), for headers next to the name. Decorative by default. */
export function BrandMark({ tone = "light", className, alt = "" }: { tone?: "light" | "dark"; className?: string; alt?: string }) {
  return (
    <Image
      src={tone === "dark" ? "/brand/proctra-mark-dark.svg" : "/brand/proctra-mark.svg"}
      alt={alt}
      width={120}
      height={60}
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
      src={tone === "dark" ? "/brand/proctra-logo-dark.svg" : "/brand/proctra-logo.svg"}
      alt="Proctra: your interview assistant"
      width={320}
      height={72}
      unoptimized
      priority
      className={cn("h-14 w-auto", className)}
    />
  );
}

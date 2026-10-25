"use client";

import { useEffect, useRef } from "react";

const SPACING = 13; // px between neighbouring lines
const STEP = 8; // px between samples along a line
const FPS = 30;

/**
 * Decorative field of flowing vertical contour lines (canvas). Neighbouring lines share most of
 * their phase so they move like a contour map; every 9th line swings wider and crosses its
 * neighbours. Capped at 30 fps, paused while the tab is hidden, and drawn once (static) when the
 * user prefers reduced motion.
 */
export function LineField({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      const lines = Math.ceil(w / SPACING) + 6;
      for (let i = -3; i < lines; i++) {
        const wide = i % 9 === 0;
        const amp = wide ? 46 : 18 + 10 * Math.sin(i * 0.37);
        // Tuned for a light background (the site's slate-50 surface).
        ctx.strokeStyle = wide ? "rgba(139, 92, 246, 0.55)" : i % 3 === 0 ? "rgba(79, 70, 229, 0.32)" : "rgba(99, 102, 241, 0.2)";
        ctx.beginPath();
        for (let y = -STEP; y <= h + STEP; y += STEP) {
          const dx =
            amp * Math.sin(y * 0.006 + t * 0.35 + i * 0.12) +
            0.6 * amp * Math.sin(y * 0.013 - t * 0.22 + i * (wide ? 0.9 : 0.05)) +
            6 * Math.sin(y * 0.031 + t * 0.6 + i * 0.4);
          const x = i * SPACING + dx;
          if (y === -STEP) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < 1000 / FPS) return;
      last = now;
      draw((now - t0) / 1000);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(el);
    if (reduced) draw(0);
    else raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvas} aria-hidden className={className} />;
}

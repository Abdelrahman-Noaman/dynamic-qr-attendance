import { useEffect } from "react";

/**
 * Publishes pointer position for the existing decorative parallax stickers.
 */
export function usePointerFx() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    const root = document.documentElement;
    let raf = 0;
    let x = 0;
    let y = 0;

    const flush = () => {
      raf = 0;
      root.style.setProperty("--px", ((x / window.innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--py", ((y / window.innerHeight) * 2 - 1).toFixed(3));
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

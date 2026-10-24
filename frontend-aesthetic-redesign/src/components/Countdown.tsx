import { useEffect, useRef } from "react";

interface Props {
  active: boolean;
  frozen: boolean;
  durationMs: number;
  /** changes every time a fresh token arrives → restarts the timer */
  seq: number;
}

/**
 * Token countdown. Updates the DOM directly from requestAnimationFrame so the
 * React tree never re-renders at 60fps.
 */
export function Countdown({ active, frozen, durationMs, seq }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    const num = numRef.current;
    const text = textRef.current;
    if (!root || !bar || !num || !text) return;

    if (!active) {
      bar.style.width = "0%";
      num.textContent = "--";
      text.textContent = "Token timer idle";
      root.dataset.tone = "idle";
      return;
    }

    if (frozen) return; // keep whatever is on screen while stopping

    const start = performance.now();
    let raf = 0;
    let lastSec = -1;

    const tick = (now: number) => {
      const remaining = Math.max(0, durationMs - (now - start));
      const pct = remaining / durationMs;

      bar.style.width = `${(pct * 100).toFixed(2)}%`;
      // Colour shift: green → yellow → red
      root.dataset.tone = pct > 0.5 ? "ok" : pct > 0.2 ? "warn" : "hot";

      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        num.textContent = String(sec).padStart(2, "0");
        text.textContent = remaining > 0 ? `Next token in ${sec}s` : "Refreshing…";
      }

      if (remaining > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        text.textContent = "Refreshing…";
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, frozen, durationMs, seq]);

  return (
    <div ref={rootRef} data-tone="idle" className="cd flex items-end gap-5">
      <span
        ref={numRef}
        className="min-w-[2ch] font-display text-[clamp(3.5rem,8vw,5.5rem)] leading-[0.8] font-black tracking-[-0.06em] tabular-nums transition-colors duration-300 [color:var(--cd)]"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 pb-1">
        <p
          ref={textRef}
          className="mb-2.5 min-h-[1.25rem] font-mono text-xs tracking-wide text-cream/70 uppercase"
        />
        <div
          className="relative h-4 overflow-hidden rounded-full bg-white/10"
          role="presentation"
        >
          <div
            ref={barRef}
            className="h-full rounded-full shadow-[0_0_24px_-2px_var(--cd)] [background-color:var(--cd)]"
            style={{ width: "0%" }}
          />
          <div className="cd-segments pointer-events-none absolute inset-0" />
        </div>
      </div>
    </div>
  );
}

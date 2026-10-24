import { useEffect, useRef } from "react";

interface Props {
  active: boolean;
  frozen: boolean;
  durationMs: number;
  /** Changes on every fresh token so the bar restarts. */
  seq: number;
}

/**
 * Token lifetime indicator. requestAnimationFrame writes straight to the DOM
 * so a 60fps bar never re-renders the React tree. The visible number is
 * hidden from assistive tech — it changes every second and would be noise;
 * the static caption underneath carries the same information.
 */
export function Countdown({ active, frozen, durationMs, seq }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const secondsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    const seconds = secondsRef.current;
    if (!root || !bar || !seconds) return;

    if (!active) {
      root.dataset.tone = "idle";
      bar.style.width = "0%";
      seconds.textContent = "--";
      return;
    }
    if (frozen) return;

    const startedAt = performance.now();
    let frame = 0;
    let lastSecond = -1;

    const tick = (now: number) => {
      const remaining = Math.max(0, durationMs - (now - startedAt));
      const fraction = remaining / durationMs;
      bar.style.width = `${(fraction * 100).toFixed(2)}%`;
      root.dataset.tone = fraction > 0.5 ? "ok" : fraction > 0.2 ? "warn" : "hot";

      const second = Math.ceil(remaining / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        seconds.textContent = remaining > 0 ? `${second}s` : "0s";
      }
      if (remaining > 0) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, frozen, durationMs, seq]);

  const caption = !active
    ? "The code appears when a session starts."
    : frozen
      ? "Session ending — the code is frozen."
      : `This code changes every ${Math.round(durationMs / 1000)} seconds.`;

  return (
    <div ref={rootRef} data-tone="idle" className="cd w-full">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <p className="label-micro text-fg-muted">Next code</p>
        <span
          ref={secondsRef}
          aria-hidden="true"
          className="tabular font-mono text-sm font-bold [color:var(--cd)]"
        >
          --
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          ref={barRef}
          className="h-full rounded-full transition-[width] duration-150 ease-linear [background-color:var(--cd)]"
          style={{ width: "0%" }}
        />
        <div className="cd-segments pointer-events-none absolute inset-0" />
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">{caption}</p>
    </div>
  );
}

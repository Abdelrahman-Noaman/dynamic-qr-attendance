/** Small, dependency-free formatters shared by the dashboard views. */

/** Epoch ms → `"14:05:32"` when seconds matter (confirmation timestamps). */
export function formatClock(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return "—";
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Elapsed time as a compact human string: `"4 min ago"`, `"just now"`. */
export function formatAge(epochMs: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - epochMs) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

/** `0.834` → `"83%"` */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

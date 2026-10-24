import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type BadgeTone = "neutral" | "live" | "attention" | "danger";

const TONE: Record<BadgeTone, { wrap: string; dot: string }> = {
  neutral: { wrap: "border-line-strong text-fg-muted", dot: "bg-fg-subtle" },
  live: { wrap: "border-lime/60 bg-lime/10 text-lime", dot: "bg-lime animate-live-pulse" },
  attention: { wrap: "border-amber/60 bg-amber/10 text-amber", dot: "bg-amber" },
  danger: { wrap: "border-pink/60 bg-pink/10 text-pink", dot: "bg-pink" },
};

interface Props {
  tone?: BadgeTone;
  children: ReactNode;
  /** Disables the leading status dot for label-style badges. */
  dot?: boolean;
  className?: string;
}

/** Compact status pill. The dot is decorative; the text carries the meaning. */
export function Badge({ tone = "neutral", children, dot = true, className }: Props) {
  const style = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-2xs font-bold tracking-[0.14em] uppercase",
        style.wrap,
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />}
      {children}
    </span>
  );
}

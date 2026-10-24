import type { CSSProperties, ReactNode } from "react";
import { cn } from "../utils/cn";
import { SparkleIcon } from "./Icons";

/** Wrapper that drifts with the pointer (CSS vars published by usePointerFx). */
export function Parallax({
  depth = 12,
  className,
  children,
  style,
}: {
  depth?: number;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("pointer-events-none absolute", className)}
      style={{
        transform: `translate3d(calc(var(--px) * ${depth}px), calc(var(--py) * ${depth}px), 0)`,
        transition: "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Sparkle({
  className,
  slow,
}: {
  className?: string;
  slow?: boolean;
}) {
  return (
    <SparkleIcon className={cn(slow ? "animate-float-slow" : "animate-float", className)} />
  );
}

/** Circular rotating text badge */
export function SpinBadge({
  text,
  icon,
  className,
}: {
  text: string;
  icon: ReactNode;
  className?: string;
}) {
  // Space Mono advances ≈0.612em per glyph; spread the text so it wraps the circle exactly
  const circumference = 2 * Math.PI * 45;
  const advance = 11.5 * 0.612 + 0.35; // bold glyphs run slightly wider
  const spacing = Math.max(0, circumference / Array.from(text).length - advance);

  return (
    <div
      className={cn(
        "relative grid size-[104px] place-items-center rounded-full bg-lime text-ink shadow-[0_10px_30px_-8px_rgba(200,255,46,0.55)] sm:size-[124px]",
        className
      )}
    >
      <svg
        viewBox="0 0 120 120"
        className="absolute inset-0 animate-spin-slow"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <path id="badge-circle" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" />
        </defs>
        <text
          fill="currentColor"
          fontSize="11.5"
          fontWeight="700"
          letterSpacing={spacing}
          style={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
        >
          <textPath href="#badge-circle">{text}</textPath>
        </text>
      </svg>
      <span className="relative grid size-11 place-items-center rounded-full bg-ink text-lime sm:size-12">
        {icon}
      </span>
    </div>
  );
}

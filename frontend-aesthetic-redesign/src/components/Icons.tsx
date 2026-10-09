import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = { "aria-hidden": true, focusable: false } as const;

export function PlayIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base} {...p}>
      <path d="M8.2 5.3c0-1.2 1.3-1.9 2.3-1.3l9.1 6.7c.9.6.9 2 0 2.6l-9.1 6.7c-1 .6-2.3-.1-2.3-1.3V5.3Z" />
    </svg>
  );
}

export function StopIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base} {...p}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="3.2" />
    </svg>
  );
}

export function LockIcon(p: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base}
      {...p}
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function SparkleIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base} {...p}>
      <path d="M12 0c.8 7.2 4.8 11.2 12 12-7.2.8-11.2 4.8-12 12-.8-7.2-4.8-11.2-12-12 7.2-.8 11.2-4.8 12-12Z" />
    </svg>
  );
}

export function ArrowIcon(p: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base}
      {...p}
    >
      <path d="M6 18 18 6M8 6h10v10" />
    </svg>
  );
}

export function ExpandIcon(p: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base}
      {...p}
    >
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export function ShrinkIcon(p: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base}
      {...p}
    >
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}

export function AlertIcon(p: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base}
      {...p}
    >
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </svg>
  );
}

export function EyeIcon({ off, ...p }: P & { off?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base}
      {...p}
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

/** Tiny QR-ish glyph used for the logo and sticker centres */
export function ScanGlyph(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base} {...p}>
      <path d="M3 3h8v8H3V3Zm2.5 2.5v3h3v-3h-3ZM13 3h8v8h-8V3Zm2.5 2.5v3h3v-3h-3ZM3 13h8v8H3v-8Zm2.5 2.5v3h3v-3h-3ZM13 13h3v3h-3v-3Zm5 0h3v3h-3v-3Zm-5 5h3v3h-3v-3Zm5 0h3v3h-3v-3Z" />
    </svg>
  );
}

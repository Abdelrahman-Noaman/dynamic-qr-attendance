import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

const solid = { fill: "currentColor", "aria-hidden": true, focusable: false } as const;

export function PlayIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...solid} {...p}>
      <path d="M8.2 5.3c0-1.2 1.3-1.9 2.3-1.3l9.1 6.7c.9.6.9 2 0 2.6l-9.1 6.7c-1 .6-2.3-.1-2.3-1.3V5.3Z" />
    </svg>
  );
}

export function StopIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...solid} {...p}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" />
    </svg>
  );
}

export function LockIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function CheckIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.4} {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function AlertIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.2} {...p}>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </svg>
  );
}

export function InfoIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </svg>
  );
}

export function EyeIcon({ off, ...p }: P & { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function ExpandIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export function ShrinkIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}

export function CopyIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14" />
    </svg>
  );
}

export function MapPinIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export function ExternalIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 14.5V18a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V7.5A2.5 2.5 0 0 1 6 5h3.5" />
    </svg>
  );
}

export function RefreshIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M20 11a8 8 0 1 0-2.6 6.3" />
      <path d="M20 4.5V11h-6.5" />
    </svg>
  );
}

/** QR-corner glyph used as the product mark. */
export function ScanGlyph(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...solid} {...p}>
      <path d="M3 3h8v8H3V3Zm2.5 2.5v3h3v-3h-3ZM13 3h8v8h-8V3Zm2.5 2.5v3h3v-3h-3ZM3 13h8v8H3v-8Zm2.5 2.5v3h3v-3h-3ZM13 13h3v3h-3v-3Zm5 0h3v3h-3v-3Zm-5 5h3v3h-3v-3Zm5 0h3v3h-3v-3Z" />
    </svg>
  );
}

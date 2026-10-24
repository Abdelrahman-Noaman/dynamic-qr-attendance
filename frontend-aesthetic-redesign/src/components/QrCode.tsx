import { useMemo, type ReactNode } from "react";
import qrcode from "qrcode-generator";

const INK = "#0a0612";
/** Modules of quiet zone. Four is the spec minimum; it is what scanners need. */
const QUIET = 4;

interface Matrix {
  count: number;
  /** Row-major booleans; `true` = dark. */
  cells: boolean[];
}

function buildMatrix(value: string): Matrix {
  const qr = qrcode(0, "M"); // error correction M, same as the original page
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const cells: boolean[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) cells.push(qr.isDark(row, col));
  }
  return { count, cells };
}

/**
 * Crisp module QR code. Rounded "pixel" styling was removed deliberately:
 * projected codes are scanned from the back of a lecture hall, so square
 * modules on a light ground with a full quiet zone are the reliable choice.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { count, cells } = useMemo(() => buildMatrix(value), [value]);
  const size = count + QUIET * 2;

  // One path for every dark module keeps the DOM at a single node.
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (cells[row * count + col]) path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} fill="#f5f0e6" />
      <path d={path} fill={INK} />
    </svg>
  );
}

/**
 * Empty state for the projector. It is deliberately a frame and a sentence,
 * never a fake QR: a plausible-looking code on a projector wastes a lecture.
 */
export function QrPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-line-strong bg-ink/40 p-6 text-center">
      <span aria-hidden="true" className="grid grid-cols-3 gap-1 opacity-40">
        {Array.from({ length: 9 }).map((_, index) => (
          <span key={index} className="size-2 rounded-[1px] bg-fg-subtle" />
        ))}
      </span>
      <p className="max-w-[22ch] text-[12px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  );
}

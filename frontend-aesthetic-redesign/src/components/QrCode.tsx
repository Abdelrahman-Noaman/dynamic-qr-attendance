import { useMemo } from "react";
import qrcode from "qrcode-generator";

const INK = "#0a0612";
const MARGIN = 2; // quiet-zone modules inside the SVG (the card adds more)

interface Built {
  n: number;
  d: string;
}

function build(value: string): Built {
  const qr = qrcode(0, "M"); // error-correction M, same as the original page
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();

  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  // Each dark module = a tiny closed square stroked with round joins → rounded "pixel"
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!inFinder(r, c) && qr.isDark(r, c)) {
        d += `M${c + 0.31} ${r + 0.31}h.38v.38h-.38z`;
      }
    }
  }
  return { n, d };
}

export function QrCode({ value, label }: { value: string; label: string }) {
  const { n, d } = useMemo(() => build(value), [value]);
  const size = n + MARGIN * 2;
  const eyes: Array<[number, number]> = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ];

  return (
    <svg
      viewBox={`${-MARGIN} ${-MARGIN} ${size} ${size}`}
      role="img"
      aria-label={label}
      className="block h-full w-full"
    >
      <path d={d} fill={INK} stroke={INK} strokeWidth=".56" strokeLinejoin="round" />
      {eyes.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect
            x={x + 0.5}
            y={y + 0.5}
            width="6"
            height="6"
            rx="1.9"
            fill="none"
            stroke={INK}
            strokeWidth="1"
          />
          <rect x={x + 2} y={y + 2} width="3" height="3" rx="1" fill={INK} />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Idle skeleton: a twinkling grid of "pixels" — clearly not a real QR */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GHOST_N = 25;

export function QrGhost() {
  const cells = useMemo(() => {
    const rnd = mulberry32(2026);
    const out: Array<{ x: number; y: number; delay: number; hue: number }> = [];
    for (let y = 0; y < GHOST_N; y++) {
      for (let x = 0; x < GHOST_N; x++) {
        const inEye =
          (x < 8 && y < 8) || (x >= GHOST_N - 8 && y < 8) || (x < 8 && y >= GHOST_N - 8);
        if (inEye) continue;
        if (rnd() < 0.5) {
          out.push({ x, y, delay: rnd() * 3.2, hue: rnd() });
        }
      }
    }
    return out;
  }, []);

  const eyes: Array<[number, number]> = [
    [0, 0],
    [GHOST_N - 7, 0],
    [0, GHOST_N - 7],
  ];

  return (
    <svg
      viewBox={`-2 -2 ${GHOST_N + 4} ${GHOST_N + 4}`}
      aria-hidden="true"
      focusable="false"
      className="block h-full w-full"
    >
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x + 0.1}
          y={c.y + 0.1}
          width="0.8"
          height="0.8"
          rx="0.28"
          fill={c.hue > 0.78 ? "#ff3ea5" : c.hue > 0.45 ? "#7b2cff" : "#0a0612"}
          className="animate-twinkle"
          style={{ animationDelay: `${c.delay}s`, opacity: 0.12 }}
        />
      ))}
      {eyes.map(([x, y]) => (
        <g key={`${x}-${y}`} opacity="0.2">
          <rect
            x={x + 0.5}
            y={y + 0.5}
            width="6"
            height="6"
            rx="1.9"
            fill="none"
            stroke="#7b2cff"
            strokeWidth="1"
            strokeDasharray="2.2 1.4"
          />
          <rect x={x + 2} y={y + 2} width="3" height="3" rx="1" fill="#7b2cff" />
        </g>
      ))}
    </svg>
  );
}

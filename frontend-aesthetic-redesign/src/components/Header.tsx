import { cn } from "../utils/cn";
import { LockIcon, ScanGlyph } from "./Icons";

export type Phase = "Locked" | "Idle" | "Starting" | "Live" | "Stopping" | "Error";

const PHASE_STYLE: Record<Phase, string> = {
  Locked: "border-pink text-pink",
  Idle: "border-white/25 text-cream/75",
  Starting: "border-amber text-amber",
  Live: "border-lime bg-lime text-ink",
  Stopping: "border-amber text-amber",
  Error: "border-pink bg-pink text-ink",
};

export function Header({ phase, keyHint }: { phase: Phase; keyHint: string | null }) {
  return (
    <header className="mx-auto flex max-w-[1500px] animate-fade-up items-center justify-between gap-4 px-5 pt-6 sm:px-10">
      <div className="group flex items-center gap-3">
        <span className="grid size-12 -rotate-6 place-items-center rounded-2xl bg-lime text-ink shadow-[0_6px_0_-1px_rgba(10,6,18,0.6)] transition-transform duration-300 ease-snap group-hover:rotate-6 group-hover:scale-110">
          <ScanGlyph className="size-6" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="font-display text-sm font-extrabold tracking-tight">QR</span>
          <span className="font-serif text-xl text-lime italic">attendance</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        {keyHint && (
          <span
            className="hidden items-center gap-2 rounded-full border border-white/20 px-3.5 py-2 font-mono text-xs font-bold tracking-[0.14em] text-cream/80 uppercase sm:flex"
            title="Key detected in the URL"
          >
            <LockIcon className="size-3.5 text-lime" />
            Key {keyHint}
          </span>
        )}
        <span
          aria-live="polite"
          className={cn(
            "flex items-center gap-2 rounded-full border-2 px-4 py-2 font-mono text-xs font-bold tracking-[0.18em] uppercase transition-colors duration-300",
            PHASE_STYLE[phase]
          )}
        >
          <span className="relative flex size-2.5">
            {phase === "Live" && (
              <span className="absolute inset-0 animate-ping-soft rounded-full bg-current" />
            )}
            <span className="relative size-2.5 rounded-full bg-current" />
          </span>
          {phase}
        </span>
      </div>
    </header>
  );
}

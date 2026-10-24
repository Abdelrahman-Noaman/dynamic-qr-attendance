import { cn } from "../utils/cn";
import { SparkleIcon } from "./Icons";

const WORDS = [
  "Roll call, but make it 2026",
  "Scan in",
  "No proxy",
  "Tokens rotate",
  "Be present",
  "Locked in",
];

function Band({ reverse, className }: { reverse?: boolean; className?: string }) {
  return (
    <div className={cn("overflow-hidden border-y-2 border-ink py-3.5", className)}>
      <div
        className={cn(
          "flex w-max hover:[animation-play-state:paused]",
          reverse ? "animate-marquee-rev" : "animate-marquee"
        )}
      >
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 items-center">
            {[...WORDS, ...WORDS].map((w, i) => (
              <li
                key={`${copy}-${i}`}
                className="flex items-center gap-6 pr-6 font-display text-[clamp(1.3rem,2.8vw,2.3rem)] font-black tracking-tight whitespace-nowrap uppercase"
              >
                {w}
                <SparkleIcon className="size-5 shrink-0 sm:size-6" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

/** Two crossing ticker bands — pure decoration, hidden from assistive tech. */
export function Marquee() {
  return (
    <div aria-hidden="true" className="relative mt-6 overflow-hidden pt-8 pb-12">
      <Band className="relative z-10 -rotate-[1.6deg] scale-[1.04] bg-lime text-ink" />
      <Band
        reverse
        className="-mt-6 rotate-[1.4deg] scale-[1.04] bg-violet text-cream"
      />
    </div>
  );
}

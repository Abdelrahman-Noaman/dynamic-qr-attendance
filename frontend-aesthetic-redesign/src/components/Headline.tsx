import { SparkleIcon } from "./Icons";
import { Parallax, Sparkle } from "./Stickers";

function Letters({ text, start = 0, step = 45 }: { text: string; start?: number; step?: number }) {
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          className="inline-block animate-rise"
          style={{ animationDelay: `${start + i * step}ms` }}
        >
          <span className="pointer-events-auto inline-block transition-[transform,color] duration-300 ease-snap hover:-translate-y-[0.07em] hover:-rotate-3 hover:text-pink">
            {ch}
          </span>
        </span>
      ))}
    </>
  );
}

export function Headline() {
  return (
    <div className="relative">
      <Parallax className="-top-6 right-[6%] z-0" depth={16}>
        <Sparkle className="size-9 text-violet-soft sm:size-12" />
      </Parallax>
      <Parallax className="top-[46%] -right-2 z-0 hidden sm:block" depth={-22}>
        <Sparkle className="size-7 text-lime" slow />
      </Parallax>

      <h1 className="relative leading-none">
        <span className="sr-only">QR Attendance</span>

        <span aria-hidden="true" className="block">
          {/* line 1 — QR + stickers */}
          <span className="flex items-end gap-3 sm:gap-6">
            <span className="block font-display text-[clamp(5.5rem,17vw,16rem)] leading-[0.8] font-black tracking-[-0.07em] text-lime select-none">
              <Letters text="QR" start={120} step={90} />
            </span>

            <span className="mb-1 flex min-w-0 animate-fade-up flex-col items-start gap-2.5 [animation-delay:700ms] sm:mb-3">
              <span className="group inline-flex -rotate-[5deg] items-center gap-2 rounded-[1.1rem] bg-pink px-3.5 py-2 font-mono text-[11px] leading-tight font-bold tracking-[0.12em] text-ink uppercase shadow-[0_8px_0_-2px_rgba(10,6,18,0.55)] transition-transform duration-300 ease-snap hover:rotate-[3deg] hover:scale-105 sm:rounded-full sm:px-5 sm:py-2.5 sm:text-sm">
                <SparkleIcon className="size-3.5 shrink-0 sm:size-4" />
                Professor Control Panel
              </span>
              <span className="ml-3 inline-flex rotate-[3deg] items-center gap-2 rounded-2xl border-2 sm:rounded-full border-cream/60 px-3.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.16em] text-cream uppercase transition-transform duration-300 ease-snap hover:-rotate-2 hover:scale-105 sm:text-xs">
                <span className="size-1.5 rounded-full bg-lime" />
                Rotating tokens · no proxy
              </span>
            </span>
          </span>

          {/* line 2 — editorial italic + outline */}
          <span className="-mt-[0.01em] block font-serif text-[clamp(3.6rem,11vw,10.5rem)] leading-[0.9] tracking-[-0.025em] text-cream italic select-none">
            <Letters text="Attend" start={380} />
            <span className="text-outline">
              <Letters text="ance" start={380 + 6 * 45} />
            </span>
          </span>
        </span>
      </h1>

      <p className="mt-7 max-w-md animate-fade-up font-mono text-sm leading-relaxed text-cream/75 [animation-delay:900ms] sm:text-[15px]">
        Name your lecture, hit <span className="font-bold text-lime">Start</span>, and put the code
        on the big screen. It refreshes itself — so nobody can sign in for a friend.
      </p>
    </div>
  );
}

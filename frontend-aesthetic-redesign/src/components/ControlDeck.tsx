import type { FormEvent } from "react";
import type { Status, Tone } from "../hooks/useAttendance";
import { cn } from "../utils/cn";
import { AlertIcon, LockIcon, PlayIcon, StopIcon } from "./Icons";
import { MagneticButton } from "./MagneticButton";

interface Props {
  lecture: string;
  onLectureChange: (v: string) => void;
  lectureDisabled: boolean;
  startDisabled: boolean;
  stopDisabled: boolean;
  starting: boolean;
  stopping: boolean;
  live: boolean;
  status: Status;
  onStart: () => void;
  onStop: () => void;
}

const TONE: Record<Tone, string> = {
  idle: "border-white/15 bg-white/[0.03] text-cream/75",
  running: "border-lime/50 bg-lime/10 text-lime",
  stopped: "border-amber/50 bg-amber/10 text-amber",
  error: "border-pink/60 bg-pink/10 text-pink",
};

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "error") return <AlertIcon className="size-4 shrink-0" />;
  if (tone === "stopped") return <span className="size-2.5 shrink-0 rounded-[3px] bg-current" />;
  if (tone === "running")
    return (
      <span className="relative flex size-2.5 shrink-0">
        <span className="absolute inset-0 animate-ping-soft rounded-full bg-current" />
        <span className="relative size-2.5 rounded-full bg-current" />
      </span>
    );
  return <span className="size-2.5 shrink-0 rounded-full border-2 border-current" />;
}

function StatusLine({ status }: { status: Status }) {
  const text = status.msg || "Standing by — name your lecture, then hit Start.";
  const tone: Tone = status.msg ? status.tone : "idle";

  return (
    <div
      id="status"
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className="mt-7 min-h-[3rem]"
    >
      <div
        key={status.id}
        className={cn(
          "inline-flex max-w-full items-center gap-3 rounded-full border px-4 py-2.5 font-mono text-[13px] leading-snug sm:text-sm",
          tone === "error" ? "animate-shake" : "animate-pop",
          TONE[tone]
        )}
      >
        <ToneIcon tone={tone} />
        <span className="min-w-0 break-words">{text}</span>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="ml-0.5 inline-flex gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5 animate-dot rounded-full bg-current"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function ControlDeck({
  lecture,
  onLectureChange,
  lectureDisabled,
  startDisabled,
  stopDisabled,
  starting,
  stopping,
  live,
  status,
  onStart,
  onStop,
}: Props) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!startDisabled) onStart();
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "relative rounded-[2rem] border bg-ink-2/90 p-6 transition-[border-color,box-shadow] duration-500 sm:p-8",
        live
          ? "border-lime/70 shadow-[0_0_90px_-24px_rgba(200,255,46,0.55)]"
          : "border-white/15 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.8)]"
      )}
    >
      <span className="absolute -top-3.5 left-6 rounded-full bg-violet px-3.5 py-1 font-mono text-[11px] font-bold tracking-[0.2em] text-cream uppercase">
        01 / Session
      </span>

      <div className="group/field">
        <label
          htmlFor="lecture"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-xs font-bold tracking-[0.2em] text-pink uppercase transition-colors duration-200 group-focus-within/field:text-lime"
        >
          <span>Lecture name</span>
          {lectureDisabled && (
            <span className="flex items-center gap-1.5 tracking-[0.14em] text-cream/65 normal-case">
              <LockIcon className="size-3.5" />
              locked while live
            </span>
          )}
        </label>
        <input
          id="lecture"
          type="text"
          value={lecture}
          onChange={(e) => onLectureChange(e.target.value)}
          disabled={lectureDisabled}
          maxLength={60}
          autoComplete="off"
          placeholder="Lecture"
          className="mt-2 w-full rounded-none border-0 border-b-[3px] border-white/20 bg-transparent pb-3 font-display text-[clamp(1.5rem,3.4vw,2.5rem)] font-bold tracking-tight text-cream transition-[border-color,box-shadow] duration-200 outline-none placeholder:text-cream/25 focus:border-lime focus:shadow-[0_16px_22px_-18px_rgba(200,255,46,0.7)] disabled:cursor-not-allowed disabled:border-dashed disabled:text-cream/45"
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-4">
        {/* Start */}
        <MagneticButton
          type="submit"
          id="btnStart"
          disabled={startDisabled}
          wrapperClassName="w-full sm:w-auto"
          className={cn(
            "group relative isolate flex items-center justify-center overflow-hidden rounded-full bg-lime px-3 py-3 pr-8 font-display text-base font-extrabold tracking-wide text-ink uppercase",
            "disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-cream/45 disabled:hatch"
          )}
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-[-10%] top-full -z-10 h-[190%] rounded-[50%] bg-pink transition-[top] duration-500 ease-snap group-hover:top-[-45%] group-disabled:hidden"
          />
          <span className="flex items-center gap-4">
            <span className="grid size-11 place-items-center rounded-full bg-ink text-lime transition-transform duration-500 group-enabled:group-hover:rotate-[360deg] group-disabled:bg-white/10 group-disabled:text-cream/45">
              <PlayIcon className="ml-0.5 size-5" />
            </span>
            {starting ? (
              <span className="flex items-center gap-1">
                Starting
                <Dots />
              </span>
            ) : (
              "Start"
            )}
          </span>
        </MagneticButton>

        {/* Stop */}
        <MagneticButton
          id="btnStop"
          disabled={stopDisabled}
          onClick={onStop}
          wrapperClassName="w-full sm:w-auto"
          className={cn(
            "group relative isolate flex items-center justify-center overflow-hidden rounded-full border-2 border-pink bg-transparent px-3 py-[10px] pr-8 font-display text-base font-extrabold tracking-wide text-pink uppercase",
            "disabled:cursor-not-allowed disabled:border-dashed disabled:border-white/20 disabled:text-cream/45 disabled:hatch"
          )}
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-[-10%] top-full -z-10 h-[190%] rounded-[50%] bg-pink transition-[top] duration-500 ease-snap group-hover:top-[-45%] group-disabled:hidden"
          />
          <span className="flex items-center gap-4 transition-colors duration-300 group-enabled:group-hover:text-ink group-disabled:text-cream/45">
            <span className="grid size-11 place-items-center rounded-full bg-pink text-ink transition-colors duration-300 group-enabled:group-hover:bg-ink group-enabled:group-hover:text-pink group-disabled:bg-white/10 group-disabled:text-cream/45">
              <StopIcon className="size-5" />
            </span>
            {stopping ? (
              <span className="flex items-center gap-1">
                Stopping
                <Dots />
              </span>
            ) : (
              "Stop"
            )}
          </span>
        </MagneticButton>
      </div>

      <StatusLine status={status} />
    </form>
  );
}

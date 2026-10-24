import type { Status, Tone } from "../hooks/useAttendance";
import { cn } from "../utils/cn";
import { AlertIcon, InfoIcon } from "./Icons";

const TONE: Record<Tone, { box: string; icon: string }> = {
  idle: { box: "border-line bg-white/[0.02] text-fg-muted", icon: "text-fg-subtle" },
  running: { box: "border-lime/45 bg-lime/[0.07] text-lime", icon: "text-lime" },
  stopped: { box: "border-amber/45 bg-amber/[0.06] text-amber", icon: "text-amber" },
  error: { box: "border-pink/55 bg-pink/[0.07] text-pink", icon: "text-pink" },
};

const ICON: Record<Tone, typeof InfoIcon> = {
  idle: InfoIcon,
  running: InfoIcon,
  stopped: InfoIcon,
  error: AlertIcon,
};

/**
 * Single place where the session's latest message is announced. Errors are
 * assertive; everything else is polite so a running session does not
 * interrupt a screen-reader user mid-sentence.
 */
export function StatusBanner({ status, idleText }: { status: Status; idleText: string }) {
  const tone: Tone = status.msg ? status.tone : "idle";
  const text = status.msg || idleText;
  const Icon = ICON[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed",
        TONE[tone].box,
        tone === "error" && "motion-safe:animate-rise-in",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[tone].icon)} />
      <p className="min-w-0 break-words">{text}</p>
    </div>
  );
}

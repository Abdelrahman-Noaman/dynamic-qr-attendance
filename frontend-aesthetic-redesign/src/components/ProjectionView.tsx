import { useEffect, useRef, useState } from "react";
import type { LocationCounters } from "../api/attendanceApi";
import type { QrPayload } from "../hooks/useAttendance";
import { STUDENT_URL } from "../config";
import { cn } from "../utils/cn";
import { Countdown } from "./Countdown";
import { ExpandIcon, ScanGlyph, ShrinkIcon } from "./Icons";
import { QrCode, QrPlaceholder } from "./QrCode";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

interface Props {
  qr: QrPayload | null;
  frozen: boolean;
  lectureName: string;
  tokenNo: number;
  counters: LocationCounters;
  hallLabel: string | null;
  onExit: () => void;
}

/**
 * The screen the class looks at. One job: a large, reliable code plus the
 * three facts a student needs (which lecture, how to join, what happens next).
 * Deliberately calm — this is projected in a lecture hall, not scrolled.
 */
export function ProjectionView({ qr, frozen, lectureName, tokenNo, counters, hallLabel, onExit }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const lecture = qr?.lecture ?? (lectureName.trim() || "This lecture");

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // In fullscreen the browser needs Escape to leave it first.
      if (event.key === "Escape" && !document.fullscreenElement) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    void rootRef.current?.requestFullscreen().catch(() => {});
  };

  return (
    <div ref={rootRef} className="flex min-h-svh flex-col bg-ink">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-lime text-ink">
            <ScanGlyph className="size-4" />
          </span>
          <span className="label-micro text-fg-muted">Projector</span>
        </span>
        <Badge tone={qr ? "live" : "neutral"}>{qr ? "Live" : "No session"}</Badge>
        {hallLabel && <span className="hidden truncate text-[12px] text-fg-subtle sm:inline">{hallLabel}</span>}

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={fullscreen ? <ShrinkIcon className="size-3.5" /> : <ExpandIcon className="size-3.5" />}
            onClick={toggleFullscreen}
          >
            {fullscreen ? "Windowed" : "Fullscreen"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onExit} aria-keyshortcuts="Escape">
            Exit <span className="hidden text-fg-subtle sm:inline">(Esc)</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-center justify-center gap-6 px-5 py-6">
        <div className="text-center">
          <p className="label-micro text-fg-subtle">Attendance is open</p>
          <h1 className="mt-1 font-display text-[clamp(1.9rem,4.6vw,3.4rem)] leading-[1.05] text-fg text-balance">
            {lecture}
          </h1>
        </div>

        <div className="w-full max-w-[min(94vw,720px)] rounded-xl border border-line bg-cream p-3 text-ink sm:p-4">
          <div className="flex items-center justify-between gap-3 border-b border-ink/15 px-1 pb-2">
            <span className="font-mono text-2xs font-bold tracking-[0.14em] uppercase">Scan to sign in</span>
            <span className="tabular font-mono text-2xs text-ink/60">Rotation {String(tokenNo).padStart(2, "0")}</span>
          </div>

          <div className="mt-3">
            {qr ? (
              <QrCode
                key={qr.token}
                value={qr.url}
                label={`QR code for ${lecture}. It refreshes every ${Math.round(qr.durationMs / 1000)} seconds.`}
                className="mx-auto block h-auto w-full max-w-[min(84vw,600px)] rounded-sm motion-safe:animate-qr-in"
              />
            ) : (
              <QrPlaceholder>
                {frozen ? "Session is ending — the code is hidden." : "No live session. The code appears when you start one."}
              </QrPlaceholder>
            )}
          </div>

          <div className={cn("mt-3 border-t border-ink/15 px-1 pt-2.5", !qr && "opacity-60")}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-mono text-[11px] leading-relaxed text-ink/70">
                Phone camera → open the link → allow location.
              </p>
              <p className="tabular font-mono text-[11px] font-bold text-ink">
                {qr ? `${counters.verified} verified` : "— verified"}
              </p>
            </div>
            <p className="mt-1 truncate font-mono text-[10px] text-ink/50">{STUDENT_URL.replace(/^https?:\/\//, "")}</p>
          </div>
        </div>

        <div className="w-full max-w-[min(94vw,720px)]">
          <Countdown active={Boolean(qr)} frozen={frozen} durationMs={qr?.durationMs ?? 10_000} seq={qr?.seq ?? 0} />
        </div>
      </main>

      <footer className="border-t border-line px-5 py-2.5">
        <p className="mx-auto max-w-[1100px] text-[11px] leading-relaxed text-fg-subtle">
          The code changes automatically and each ticket is single-use, signed and time-limited. A submission is
          recorded only if the student&apos;s own GPS is accurate to 50 m and inside the session radius.
        </p>
      </footer>
    </div>
  );
}

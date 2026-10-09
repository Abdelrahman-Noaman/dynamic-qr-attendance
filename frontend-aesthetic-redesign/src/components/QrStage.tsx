import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { QrPayload } from "../hooks/useAttendance";
import { cn } from "../utils/cn";
import { Countdown } from "./Countdown";
import { ExpandIcon, LockIcon, PlayIcon, ScanGlyph, ShrinkIcon } from "./Icons";
import { QrCode, QrGhost } from "./QrCode";
import { Parallax, Sparkle, SpinBadge } from "./Stickers";

interface Props {
  qr: QrPayload | null;
  frozen: boolean;
  locked: boolean;
  lectureName: string;
  tokenNo: number;
}

const TAPE =
  "[clip-path:polygon(0_0,100%_0,96%_25%,100%_50%,96%_75%,100%_100%,0_100%,4%_75%,0_50%,4%_25%)]";

export function QrStage({ qr, frozen, locked, lectureName, tokenNo }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);
  const canFs = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
  const live = Boolean(qr);

  useEffect(() => {
    const onChange = () => setIsFs(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Leave projector mode automatically when the session ends
  useEffect(() => {
    if (!qr && document.fullscreenElement === stageRef.current) {
      document.exitFullscreen().catch(() => {});
    }
  }, [qr]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      stageRef.current?.requestFullscreen().catch(() => {});
    }
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el || isFs || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 7).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 8).toFixed(2)}deg`);
    el.style.setProperty("--rot", "0deg");
  };

  const onLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
    el.style.removeProperty("--rot");
  };

  const shownLecture = qr?.lecture ?? (lectureName.trim() || "Lecture");
  const phaseLabel = locked ? "Locked" : live ? "Live" : "Idle";

  const badge = locked
    ? { text: "KEY NEEDED • KEY NEEDED • \u00A0", icon: <LockIcon className="size-5" /> }
    : live
      ? { text: "SCAN ME • SCAN ME • SCAN ME • \u00A0", icon: <ScanGlyph className="size-5" /> }
      : { text: "HIT START • HIT START • \u00A0", icon: <PlayIcon className="size-5" /> };

  return (
    <div
      ref={stageRef}
      className={cn(
        "flex w-full flex-col items-center",
        isFs &&
          "min-h-screen justify-center bg-ink bg-[radial-gradient(60%_50%_at_50%_0%,rgba(123,44,255,0.35),transparent)] p-6"
      )}
    >
      <div
        className={cn(
          "relative w-full",
          isFs ? "w-[min(92vw,calc(100svh-330px))]" : "max-w-[460px]"
        )}
      >
        {/* glow that lights up behind the ticket while a session is live */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-6 top-10 bottom-24 rounded-full bg-lime blur-[90px] transition-opacity duration-700",
            live && !frozen ? "opacity-30" : "opacity-0"
          )}
        />
        {/* ---------- Ticket ---------- */}
        <div
          ref={tiltRef}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          className="relative transition-transform duration-500 ease-snap will-change-transform [filter:drop-shadow(0_28px_36px_rgba(0,0,0,0.5))]"
          style={{
            transform: isFs
              ? "none"
              : "perspective(1100px) rotate(var(--rot, 2.2deg)) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))",
          }}
        >
          <div className="ticket relative rounded-[2rem] bg-cream text-ink">
            {/* header */}
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 font-mono text-[11px] font-bold tracking-[0.18em] uppercase">
              <span className="flex min-w-0 items-center gap-2">
                <ScanGlyph className="size-4 shrink-0" />
                <span className="truncate">Token #{String(tokenNo).padStart(2, "0")}</span>
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-2 ring-ink transition-colors duration-300",
                    live && !frozen && "bg-lime",
                    frozen && "bg-amber",
                    locked && "bg-pink",
                    !live && !locked && "bg-transparent text-ink/70 ring-ink/30"
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full bg-current",
                      live && !frozen && "animate-ping-soft"
                    )}
                  />
                  {frozen ? "Stopping" : phaseLabel}
                </span>
                {canFs && (
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    disabled={!live && !isFs}
                    aria-label={isFs ? "Exit fullscreen" : "Show QR fullscreen for the room"}
                    title={isFs ? "Exit fullscreen" : "Project fullscreen"}
                    className="grid size-9 place-items-center rounded-full bg-ink text-cream transition-all duration-200 hover:scale-110 hover:bg-violet active:scale-95 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:scale-100 disabled:hover:bg-ink"
                  >
                    {isFs ? <ShrinkIcon className="size-4" /> : <ExpandIcon className="size-4" />}
                  </button>
                )}
              </div>
            </div>

            {/* QR window */}
            <div className="px-4 pb-5">
              <div className="relative aspect-square overflow-hidden rounded-[1.4rem] bg-white p-3 ring-2 ring-ink">
                {qr ? (
                  <>
                    <div
                      key={qr.token}
                      className={cn(
                        "h-full w-full animate-qr-in transition-[opacity,filter] duration-500",
                        frozen && "opacity-30 blur-[3px]"
                      )}
                    >
                      <QrCode
                        value={qr.url}
                        label={`QR code for ${qr.lecture}. A new code appears every ${Math.round(
                          qr.durationMs / 1000
                        )} seconds.`}
                      />
                    </div>
                    <div
                      key={`scan-${qr.token}`}
                      className="scan-band pointer-events-none absolute inset-0 animate-scan"
                      aria-hidden="true"
                    />
                    {frozen && (
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="animate-pop rounded-full bg-ink px-4 py-2.5 font-mono text-xs font-bold tracking-widest text-amber uppercase">
                          Stopping…
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <QrGhost />
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="flex animate-float-slow items-center gap-2.5 rounded-full bg-ink px-4 py-3 font-mono text-xs font-bold tracking-widest text-cream uppercase shadow-xl">
                        {locked ? (
                          <>
                            <LockIcon className="size-4 text-pink" />
                            Key required
                          </>
                        ) : (
                          <>
                            <span className="relative flex size-2.5">
                              <span className="absolute inset-0 animate-ping-soft rounded-full bg-lime" />
                              <span className="relative size-2.5 rounded-full bg-lime" />
                            </span>
                            Waiting for a session
                          </>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* perforated footer */}
            <div className="relative flex h-24 items-center justify-between gap-4 px-6 pt-1">
              <div className="absolute inset-x-6 top-0 border-t-2 border-dashed border-ink/30" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-ink/65 uppercase">
                  Lecture
                </p>
                <p
                  className="truncate font-serif text-[clamp(2rem,4vw,2.8rem)] leading-[1.05] italic"
                  title={shownLecture}
                >
                  {shownLecture}
                </p>
              </div>
              <p className="hidden shrink-0 text-right font-mono text-[10px] leading-snug font-bold tracking-[0.2em] text-ink/65 uppercase sm:block">
                Scan to
                <br />
                sign in
              </p>
            </div>
          </div>

          {/* tape + stickers (outside the masked ticket so they can overlap its edge) */}
          <div
            className={cn(
              "pointer-events-none absolute -top-3 left-10 h-7 w-24 -rotate-[7deg] bg-pink/95",
              TAPE
            )}
            aria-hidden="true"
          />
          <div
            className={cn(
              "pointer-events-none absolute -bottom-3 left-[38%] h-7 w-20 rotate-[4deg] bg-violet/95",
              TAPE
            )}
            aria-hidden="true"
          />
          <Parallax className="-top-12 -right-3 z-30 sm:-right-10" depth={18}>
            <SpinBadge text={badge.text} icon={badge.icon} />
          </Parallax>
          <Parallax className="-bottom-8 -left-5 z-30 sm:-left-9" depth={-14}>
            <Sparkle className="size-14 text-pink" slow />
          </Parallax>
        </div>

        {/* ---------- Countdown ---------- */}
        <div className="mt-9 px-1">
          <Countdown active={live} frozen={frozen} durationMs={qr?.durationMs ?? 10000} seq={qr?.seq ?? 0} />
        </div>
      </div>
    </div>
  );
}

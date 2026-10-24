import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AttendanceController } from "../hooks/useAttendance";
import { cn } from "../utils/cn";
import { PlayIcon, StopIcon } from "./Icons";
import { StatusBanner } from "./StatusBanner";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Panel } from "./ui/Panel";

interface Props {
  className?: string;
  session: AttendanceController;
  /** Human-readable reasons the Start button is unavailable. */
  blockers: string[];
  onProject: () => void;
}

const LECTURE_MAX = 60;

/**
 * The console's primary task: name the lecture, start, stop. Everything the
 * professor needs to decide whether Start is legal is visible — a disabled
 * button with no explanation is the main usability trap this replaces.
 */
export function SessionPanel({ className, session, blockers, onProject }: Props) {
  const { lecture, setLecture, phase, starting, stopping, running, status } = session;
  const [confirmStop, setConfirmStop] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const locked = running || starting;
  const canStart = blockers.length === 0 && phase === "idle";
  const canStop = phase === "live" || phase === "starting";

  useEffect(() => {
    if (!confirmStop) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmStop(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmStop]);

  // Leaving the live phase while the dialog is open would strand it.
  useEffect(() => {
    if (phase !== "live" && confirmStop) setConfirmStop(false);
  }, [phase, confirmStop]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canStart) void session.startSession();
  };

  return (
    <Panel
      id="session"
      className={className}
      kicker="01 · Control"
      title="Session"
      description="Name the lecture and open the sign-in window. Students scan the projected code; nothing is recorded until you start."
      actions={<Badge tone={phase === "live" ? "live" : phase === "starting" || phase === "stopping" ? "attention" : "neutral"}>
        {phase === "live" ? "Session live" : phase === "starting" ? "Starting" : phase === "stopping" ? "Stopping" : "Not started"}
      </Badge>}
    >
      <form onSubmit={submit} noValidate>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="lecture-name" className="label-micro text-fg-muted">
            Lecture name
          </label>
          <span className="tabular font-mono text-[11px] text-fg-subtle" aria-hidden="true">
            {lecture.length}/{LECTURE_MAX}
          </span>
        </div>
        <input
          id="lecture-name"
          name="lecture"
          type="text"
          value={lecture}
          onChange={(event) => setLecture(event.target.value)}
          disabled={locked}
          maxLength={LECTURE_MAX}
          required
          autoComplete="off"
          aria-describedby="lecture-hint"
          placeholder="e.g. Data Security — Week 6"
          className={cn(
            "mt-2 h-12 w-full rounded-lg border bg-ink px-3 font-display text-[22px] text-fg",
            "placeholder:font-mono placeholder:text-[14px] placeholder:tracking-normal placeholder:text-fg-subtle",
            "border-line transition-colors hover:border-line-strong focus:border-lime focus:outline-none",
            "disabled:cursor-not-allowed disabled:border-dashed disabled:text-fg-muted",
          )}
        />
        <p id="lecture-hint" className="mt-1.5 text-[12px] leading-relaxed text-fg-subtle">
          {locked
            ? "Locked while the session is live — the name is copied into every attendance record."
            : "Shown on the projector and written to the attendance sheet."}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!canStart}
            busy={starting}
            icon={<PlayIcon className="size-3.5" />}
            aria-describedby={blockers.length ? "start-blockers" : undefined}
          >
            {starting ? "Starting…" : "Start session"}
          </Button>

          {!confirmStop ? (
            <Button
              variant="danger"
              size="lg"
              disabled={!canStop || stopping}
              busy={stopping}
              icon={<StopIcon className="size-3.5" />}
              onClick={() => setConfirmStop(true)}
            >
              {stopping ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <div
              role="group"
              aria-label="Confirm ending the session"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-pink/50 bg-pink/[0.06] px-3 py-2"
            >
              <p className="text-[12px] text-fg">End the session for everyone?</p>
              <Button
                ref={confirmRef}
                variant="danger"
                size="sm"
                busy={stopping}
                onClick={() => {
                  setConfirmStop(false);
                  void session.stopSession();
                }}
              >
                End session
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmStop(false)}>
                Keep running
              </Button>
            </div>
          )}

          <Button variant="ghost" size="lg" onClick={onProject} aria-label="Open the projector view">
            Projector
          </Button>
        </div>

        {blockers.length > 0 && (
          <div id="start-blockers" className="mt-4 rounded-lg border border-line bg-white/[0.02] px-3 py-2.5">
            <p className="label-micro text-fg-subtle">Before you can start</p>
            <ul className="mt-1.5 space-y-1">
              {blockers.map((blocker) => (
                <li key={blocker} className="flex items-start gap-2 text-[12px] leading-relaxed text-fg-muted">
                  <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-fg-subtle" />
                  {blocker}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <StatusBanner
            status={status}
            idleText="Nothing is running. The projector shows a placeholder until a session starts."
          />
        </div>
      </form>
    </Panel>
  );
}

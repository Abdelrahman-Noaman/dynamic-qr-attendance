import { useCallback, useEffect, useMemo, useState } from "react";
import { AttendancePanel } from "./components/AttendancePanel";
import { Header, type Phase } from "./components/Header";
import { KeyGate } from "./components/KeyGate";
import { LectureHallPanel } from "./components/LectureHallPanel";
import { ProjectionView } from "./components/ProjectionView";
import { SessionPanel } from "./components/SessionPanel";
import { StudentLinkPanel } from "./components/StudentLinkPanel";
import { useAttendance, MAX_GPS_ACCURACY_METERS } from "./hooks/useAttendance";
import { useHashRoute } from "./hooks/useHashRoute";
import { LECTURE_LOCATION } from "./utils/lectureLocation";

const CONFIRMATION_WINDOW_MINUTES = Math.round(LECTURE_LOCATION.maxConfirmationAgeMs / 60_000);

/** The key lives in `?key=` — the existing contract with the n8n workflow. */
function readKeyFromUrl(): string | null {
  const value = new URLSearchParams(window.location.search).get("key");
  return value && value.trim() ? value.trim() : null;
}

/** Header label for the current state; kept in one readable place. */
function derivePhase(params: {
  locked: boolean;
  phase: "idle" | "starting" | "live" | "stopping";
  tone: "idle" | "running" | "stopped" | "error";
}): Phase {
  if (params.locked) return "Locked";
  if (params.phase === "starting") return "Starting";
  if (params.phase === "stopping") return "Stopping";
  if (params.phase === "live") return "Live";
  return params.tone === "error" ? "Error" : "Idle";
}

function writeKeyToUrl(key: string | null) {
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("key", key);
  else url.searchParams.delete("key");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function App() {
  const [key, setKey] = useState<string | null>(readKeyFromUrl);
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const { route, navigate } = useHashRoute();
  const session = useAttendance(key);

  const keyHint = key ? `••••${key.slice(-3)}` : null;

  const unlock = useCallback((next: string) => {
    writeKeyToUrl(next);
    setGateNotice(null);
    setKey(next);
  }, []);

  const forgetKey = useCallback(() => {
    writeKeyToUrl(null);
    setKey(null);
    setGateNotice("Key removed from this tab. Paste it again to control sessions.");
  }, []);

  // A rejected key must not leave a console that looks authorised.
  const locked = !key || session.keyRejected;
  const gateMessage = session.keyRejected
    ? "The attendance service rejected this key. Unlock with a valid key to continue."
    : gateNotice;

  const blockers = useMemo(() => {
    if (locked || session.phase !== "idle") return [];
    const list: string[] = [];
    if (session.lectureProblem) list.push("Name the lecture so it appears on the projector and in the sheet.");
    if (!session.lectureLocation) list.push("Confirm the lecture hall on the map.");
    else if (session.lectureLocationStatus !== "CONFIRMED")
      list.push(
        `The confirmed hall is older than ${CONFIRMATION_WINDOW_MINUTES} minutes — confirm it again for this lecture.`,
      );
    return list;
  }, [locked, session.phase, session.lectureProblem, session.lectureLocation, session.lectureLocationStatus]);

  const phase = derivePhase({ locked, phase: session.phase, tone: session.status.tone });

  const liveLecture = session.qr?.lecture ?? session.lecture;

  // Keep the tab title truthful: this is often one of several professor tabs.
  useEffect(() => {
    const parts =
      route === "projector"
        ? [session.qr ? `Live · ${liveLecture}` : "Projector", "QR Attendance"]
        : [session.qr ? `Live · ${liveLecture}` : "Professor console", "QR Attendance"];
    document.title = parts.filter(Boolean).join(" — ");
  }, [route, session.qr, liveLecture]);

  // The projector needs a keyed session; otherwise stay on the console.
  const showProjector = route === "projector" && !locked;
  const openProjector = useCallback(() => navigate("projector"), [navigate]);
  const closeProjector = useCallback(() => navigate("dashboard"), [navigate]);

  if (showProjector) {
    return (
      <ProjectionView
        qr={session.qr}
        frozen={session.phase === "stopping"}
        lectureName={session.lecture}
        tokenNo={session.tokenNo}
        counters={session.counters}
        hallLabel={session.lectureLocation?.label ?? null}
        onExit={closeProjector}
      />
    );
  }

  return (
    <div className="relative min-h-svh">
      {/* Structural grid, not decoration: it reads as a register sheet and is
          the only background texture in the product. */}
      <div aria-hidden="true" className="app-grid pointer-events-none fixed inset-0 -z-10" />

      <a
        href="#main"
        className="sr-only rounded-md bg-lime px-3 py-2 font-mono text-xs font-bold text-ink uppercase focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to controls
      </a>

      <Header phase={phase} keyHint={keyHint} onProject={openProjector} onForgetKey={forgetKey} />

      <main id="main" className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 sm:py-8">
        {locked ? (
          <div className="mx-auto max-w-xl">
            <KeyGate notice={gateMessage} onUnlock={unlock} />
            <section aria-labelledby="locked-explainer" className="mt-6 rounded-xl border border-line p-5">
              <h2 id="locked-explainer" className="font-display text-xl">
                What happens behind this gate
              </h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-fg-muted">
                <li>You confirm the lecture hall on a map — the reference point for the session.</li>
                <li>Starting the session mints a signed, single-use ticket every few seconds.</li>
                <li>Students scan, submit their own GPS reading, and are accepted only inside the radius.</li>
                <li>Verified records are written to the attendance sheet; rejections are logged as rejected.</li>
              </ol>
            </section>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <h1 className="font-display text-[clamp(1.6rem,3vw,2.1rem)] leading-tight">
                {session.qr ? liveLecture : "Set up today's session"}
              </h1>
              <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-muted">
                {session.qr
                  ? "The code is live on the projector. Stop the session to close attendance."
                  : "Confirm where the class meets, name the lecture, then start. Nothing is recorded before that."}
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-12">
              {/* On phones the wrappers dissolve so the hall can sit between
                  starting a session and reading the numbers. */}
              <div className="max-lg:contents lg:col-span-7 lg:space-y-5">
                <SessionPanel className="order-1" session={session} blockers={blockers} onProject={openProjector} />
                <AttendancePanel
                  className="order-3"
                  counters={session.counters}
                  radiusMeters={session.attendanceRadiusMeters}
                  maxAccuracyMeters={MAX_GPS_ACCURACY_METERS}
                  idle={session.tokenNo === 0 && !session.qr}
                  tokenNo={session.tokenNo}
                />
              </div>

              <div className="max-lg:contents lg:col-span-5 lg:space-y-5">
                <LectureHallPanel
                  className="order-2"
                  value={session.lectureLocation}
                  confirmed={session.lectureLocationStatus === "CONFIRMED"}
                  notice={session.lectureLocationNotice}
                  live={session.phase === "live" || session.phase === "stopping"}
                  radiusMeters={session.attendanceRadiusMeters}
                  maxAccuracyMeters={MAX_GPS_ACCURACY_METERS}
                  onConfirm={session.confirmLectureLocation}
                  onClear={session.clearLectureLocation}
                />
                <StudentLinkPanel className="order-4" />
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="mt-4 border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2 px-5 py-4 sm:px-8">
          <p className="text-[11px] leading-relaxed text-fg-subtle">
            Records are written by your n8n workflow to Google Sheets; this page is only the console.
          </p>
          <p className="text-[11px] leading-relaxed text-fg-subtle">
            The key travels in the URL — treat a shared console link as a secret.
          </p>
        </div>
      </footer>
    </div>
  );
}

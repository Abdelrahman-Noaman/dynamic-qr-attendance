import { useMemo } from "react";
import { Backdrop } from "./components/Backdrop";
import { ControlDeck } from "./components/ControlDeck";
import { Header, type Phase } from "./components/Header";
import { Headline } from "./components/Headline";
import { KeyGate } from "./components/KeyGate";
import { Marquee } from "./components/Marquee";
import { QrStage } from "./components/QrStage";
import { Stats } from "./components/Stats";
import { useAttendance } from "./hooks/useAttendance";
import { usePointerFx } from "./hooks/usePointerFx";

export default function App() {
  // Same contract as the original page: the professor key lives in ?key=…
  const key = useMemo(() => new URLSearchParams(window.location.search).get("key"), []);
  const hasKey = Boolean(key);

  usePointerFx();
  const a = useAttendance(hasKey ? key : null);

  const phase: Phase = !hasKey
    ? "Locked"
    : a.stopping
      ? "Stopping"
      : a.starting
        ? "Starting"
        : a.qr
          ? "Live"
          : a.status.tone === "error"
            ? "Error"
            : "Idle";

  const keyHint = key ? `••••${key.slice(-3)}` : null;

  const stats = [
    { label: "State", value: phase },
    { label: "Lecture", value: a.qr?.lecture ?? "—" },
    { label: "Token rotates", value: a.qr ? `every ${Math.round(a.qr.durationMs / 1000)}s` : "—" },
    { label: "Tokens served", value: hasKey ? String(a.tokensServed).padStart(2, "0") : "—" },
  ];

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <Backdrop />
      <Header phase={phase} keyHint={keyHint} />

      <main className="mx-auto grid max-w-[1500px] gap-x-8 gap-y-20 px-5 pt-12 pb-16 sm:px-10 lg:grid-cols-12 lg:pt-14">
        <div className="relative z-10 lg:col-span-7">
          <Headline />

          <div className="mt-14 max-w-[700px] animate-fade-up [animation-delay:1000ms]">
            {hasKey ? (
              <ControlDeck
                lecture={a.lecture}
                onLectureChange={a.setLecture}
                lectureDisabled={a.lectureDisabled}
                startDisabled={a.startDisabled}
                stopDisabled={a.stopDisabled}
                starting={a.starting}
                stopping={a.stopping}
                live={Boolean(a.qr)}
                status={a.status}
                onStart={a.startSession}
                onStop={a.stopSession}
              />
            ) : (
              <KeyGate />
            )}
          </div>
        </div>

        <div className="relative z-20 animate-fade-up pt-6 [animation-delay:500ms] lg:col-span-5 lg:sticky lg:top-8 lg:self-start lg:pt-10">
          <QrStage
            qr={a.qr}
            frozen={a.stopping}
            locked={!hasKey}
            lectureName={a.lecture}
            tokenNo={a.tokensServed}
          />
        </div>
      </main>

      <Stats items={stats} />
      <Marquee />
    </div>
  );
}

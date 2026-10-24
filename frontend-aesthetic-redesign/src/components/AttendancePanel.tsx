import type { LocationCounters } from "../api/attendanceApi";
import { formatPercent } from "../utils/format";
import { Panel } from "./ui/Panel";

interface Props {
  className?: string;
  counters: LocationCounters;
  radiusMeters: number;
  maxAccuracyMeters: number;
  /** `true` while this tab has not yet seen a live session. */
  idle: boolean;
  /** Token rotations observed this tab — not a student count. */
  tokenNo: number;
}

/**
 * Attendance at a glance. The numbers come from the workflow's session
 * counters; `outsideRadius` is a subset of `rejected`, so the rows say so
 * instead of pretending the three figures add up.
 */
export function AttendancePanel({ className, counters, radiusMeters, maxAccuracyMeters, idle, tokenNo }: Props) {
  const attempts = counters.verified + counters.rejected;
  const verifiedShare = attempts === 0 ? 0 : counters.verified / attempts;
  const otherRejections = Math.max(0, counters.rejected - counters.outsideRadius);

  return (
    <Panel
      id="attendance"
      className={className}
      kicker="03 · Attendance"
      title="Verified attendance"
      compact
      description={
        idle
          ? "Figures appear here as students submit. They are counted by the attendance service, not by this page."
          : "Counters reported by the attendance service for this session; the final figures stay after you stop."
      }
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="tabular font-display text-[44px] leading-none text-lime">
            {idle ? "—" : counters.verified}
          </p>
          <p className="label-micro mt-1.5 text-fg-muted">Verified on location</p>
        </div>
        <div className="pb-1">
          <p className="tabular font-mono text-lg font-bold text-fg">
            {idle ? "—" : counters.rejected} <span className="text-[11px] font-normal text-fg-muted">rejected</span>
          </p>
          <p className="tabular mt-0.5 font-mono text-[11px] text-fg-subtle">
            {idle ? "no submissions yet" : `${attempts} location submissions · ${formatPercent(verifiedShare)} verified`}
          </p>
        </div>
      </div>

      <div
        className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="img"
        aria-label={
          idle
            ? "No attendance submissions yet"
            : `${counters.verified} verified, ${counters.rejected} rejected of ${attempts} submissions`
        }
      >
        <span className="h-full bg-lime" style={{ width: `${verifiedShare * 100}%` }} />
        <span className="h-full bg-pink/70" style={{ width: `${(1 - verifiedShare) * 100}%` }} />
      </div>

      <dl className="mt-4 divide-y divide-line/70 border-t border-line">
        <Row label={`Outside the ${radiusMeters} m radius`} value={idle ? "—" : counters.outsideRadius} />
        <Row label="Other location rejections" value={idle ? "—" : otherRejections} />
        <Row label="Code rotations this tab" value={tokenNo} muted />
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
        Verification needs the student&apos;s own GPS to report ≤{maxAccuracyMeters} m accuracy and to be within{" "}
        {radiusMeters} m of the confirmed hall. Poor accuracy is rejected, never rounded towards a pass.
      </p>
    </Panel>
  );
}

function Row({ label, value, muted }: { label: string; value: number | string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[12px] text-fg-muted">{label}</dt>
      <dd className={`tabular font-mono text-[13px] ${muted ? "text-fg-subtle" : "text-fg"}`}>{value}</dd>
    </div>
  );
}

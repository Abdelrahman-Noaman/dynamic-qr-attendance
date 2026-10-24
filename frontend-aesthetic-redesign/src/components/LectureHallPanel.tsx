import { useState } from "react";
import { LECTURE_LOCATION, type LectureLocation } from "../utils/lectureLocation";
import { formatAge, formatClock } from "../utils/format";
import { MapPinIcon } from "./Icons";
import { LocationPicker } from "./LocationPicker";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { DataList } from "./ui/Field";
import { Panel } from "./ui/Panel";

interface Props {
  className?: string;
  value: LectureLocation | null;
  confirmed: boolean;
  notice: string | null;
  live: boolean;
  radiusMeters: number;
  maxAccuracyMeters: number;
  onConfirm: (location: LectureLocation) => void;
  onClear: () => void;
}

/**
 * The session's reference point. The map is expensive to mount, so it is
 * loaded on demand: by default this panel is a summary a professor can read
 * in one glance before starting a lecture.
 */
export function LectureHallPanel({
  className,
  value,
  confirmed,
  notice,
  live,
  radiusMeters,
  maxAccuracyMeters,
  onConfirm,
  onClear,
}: Props) {
  // The map is only mounted on request: loading Leaflet for a professor who is
  // just checking today's reference is wasted work (and wasted tiles).
  const [editing, setEditing] = useState(false);
  const stale = Boolean(value) && !confirmed;

  return (
    <Panel
      id="lecture-hall"
      className={className}
      kicker="02 · Reference"
      title="Lecture hall"
      actions={
        <Badge tone={confirmed ? "live" : value ? "attention" : "neutral"}>
          {confirmed ? "Confirmed" : value ? "Needs reconfirming" : "Not set"}
        </Badge>
      }
      description="Where the class meets. Students are verified against this pin; the professor's laptop GPS is deliberately not used."
    >
      {value ? (
        <DataList
          rows={[
            {
              label: "Coordinates",
              value: `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`,
              mono: true,
            },
            ...(value.label ? [{ label: "Place", value: value.label }] : []),
            {
              label: "Confirmed",
              value: `${formatClock(value.confirmedAt)} · ${formatAge(value.confirmedAt)}`,
              mono: true,
            },
            { label: "Radius", value: `${radiusMeters} m · accuracy ≤ ${maxAccuracyMeters} m`, mono: true },
          ]}
        />
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-amber">
          <MapPinIcon className="mt-0.5 size-4 shrink-0" />
          No lecture hall is confirmed, so a session cannot start. Search for the building or place the pin by
          hand.
        </p>
      )}

      {notice && <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">{notice}</p>}

      {!live && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {stale && value && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onConfirm({ ...value, confirmedAt: Date.now() })}
            >
              Confirm again at this pin
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing((current) => !current)}
            aria-expanded={editing}
            aria-controls="hall-picker"
          >
            {editing ? "Hide map" : value ? "Change location" : "Choose location"}
          </Button>
          {stale && (
            <span className="text-[11px] text-fg-subtle">
              Re-confirm before each lecture — a reference older than{" "}
              {Math.round(LECTURE_LOCATION.maxConfirmationAgeMs / 60_000)} minutes is rejected.
            </span>
          )}
        </div>
      )}

      {live && (
        <p className="mt-4 rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-fg-muted">
          The location is locked while the session is live. Stop the session to change the hall.
        </p>
      )}

      {editing && !live && (
        <div id="hall-picker" className="mt-4">
          <ErrorBoundary
            fallback={
              <p role="alert" className="rounded-lg border border-pink/50 bg-pink/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-pink">
                The map could not load in this browser. Reload the page to try again; the rest of the console
                still works.
              </p>
            }
          >
            <LocationPicker
              value={value}
              onConfirm={onConfirm}
              onClear={onClear}
              radiusMeters={radiusMeters}
              maxAccuracyMeters={maxAccuracyMeters}
            />
          </ErrorBoundary>
        </div>
      )}
    </Panel>
  );
}

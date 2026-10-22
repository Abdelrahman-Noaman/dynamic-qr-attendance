// ============================================================
// Instructor-side location helpers.
//
// The acquisition config and every quality check live in the shared module
// frontend/location-core.js, which the student page also loads. This file only
// adds TypeScript types and the instructor policy (a poor reading may start a
// session as NEEDS_REVIEW under the REVIEW policy, but can never verify
// attendance).
// ============================================================
import {
  acquireLocation,
  describeLocationReason,
  formatAccuracy,
  haversineMeters,
  isWithinAttendanceRadius,
  LocationError,
  LOCATION_ACQUISITION,
  LOCATION_QUALITY,
  LOCATION_REASONS,
  validateReading,
} from "../../../frontend/location-core.js";

export { describeLocationReason, formatAccuracy, haversineMeters, isWithinAttendanceRadius };
export { LocationError, LOCATION_ACQUISITION, LOCATION_QUALITY, LOCATION_REASONS };

export interface LocationReading {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface AcquiredLocation {
  reading: LocationReading;
  precisionMet: boolean;
  attempts: number;
  elapsedMs: number;
}

export interface LocationProgress {
  phase: "requesting" | "reading" | "invalid" | "rejected" | "retrying";
  attempt: number;
  maxAttempts: number;
  reason?: string;
  accuracyMeters?: number;
  bestAccuracyMeters?: number;
  elapsedMs?: number;
}

export interface LocationFailure {
  reason: string;
  message: string;
  accuracyMeters?: number;
}

/**
 * True only if the reading is still fresh, in range, and has a positive
 * accuracy. A stale reading is never presented as the current position.
 */
export function isReadingFresh(reading: LocationReading | null, now = Date.now()): boolean {
  if (!reading) return false;
  return validateReading(reading, { now }).valid;
}

/** Freshness remaining before a reading must be re-acquired. */
export function readingAgeMs(reading: LocationReading | null, now = Date.now()): number | null {
  if (!reading) return null;
  return Math.max(0, now - reading.timestamp);
}

/**
 * Acquire the instructor's reference reading.
 *
 * `allowPoorAccuracy: true` keeps the existing REVIEW policy behaviour: after
 * the bounded retries, a fresh reading above the quality target is returned
 * with `precisionMet: false` so the session can start as NEEDS_REVIEW. Accuracy
 * targets and the 100 m attendance radius remain separate.
 */
export async function requestInstructorLocation(
  onProgress?: (progress: LocationProgress) => void
): Promise<AcquiredLocation> {
  return (await acquireLocation(navigator.geolocation, {
    allowPoorAccuracy: true,
    onProgress,
  })) as AcquiredLocation;
}

/** Normalise any thrown value into a reason code plus a readable message. */
export function toLocationFailure(error: unknown): LocationFailure {
  if (error instanceof LocationError) {
    return {
      reason: error.reason,
      message: error.message,
      accuracyMeters: error.details?.accuracyMeters,
    };
  }
  return {
    reason: LOCATION_REASONS.UNAVAILABLE,
    message: describeLocationReason(LOCATION_REASONS.UNAVAILABLE),
  };
}

/** Progress text for the instructor control deck. */
export function progressText(progress: LocationProgress, targetMeters = LOCATION_QUALITY.targetAccuracyMeters): string {
  const { phase, attempt, maxAttempts } = progress;
  switch (phase) {
    case "requesting":
      return attempt === 1
        ? "Requesting a fresh high-accuracy reading (cached positions are refused)…"
        : `Reading ${attempt} of ${maxAttempts} — best so far ${formatAccuracy(progress.bestAccuracyMeters)}…`;
    case "reading":
      return `Reading ${attempt} of ${maxAttempts} — reported accuracy ${formatAccuracy(progress.accuracyMeters)}.`;
    case "retrying":
      return `Reported accuracy ${formatAccuracy(progress.accuracyMeters)} is worse than the ${targetMeters} m target — requesting another fresh reading…`;
    case "invalid":
      return "That reading was unusable (invalid or stale data) — requesting another one…";
    case "rejected":
      return "The browser could not return a reading — retrying while the time window allows…";
    default:
      return "Requesting your location…";
  }
}

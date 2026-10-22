// ============================================================
// Shared browser geolocation acquisition + quality checks.
//
// Used by BOTH the instructor dashboard (React, imported from
// frontend-aesthetic-redesign/src/utils/location.ts) and the student
// attendance page (frontend/student-attendance.html). One implementation
// means the instructor and the student are judged by the same rules.
//
// Scope: this module only acquires and validates browser readings. It never
// decides attendance. The attendance radius (100 m) and the final decision
// live on the server (n8n) and are deliberately separate from GPS accuracy.
//
// Browser accuracy is an estimate provided by the device. Requesting
// `enableHighAccuracy` asks the platform for its best available fix; it does
// not guarantee an accurate position, especially indoors.
// ============================================================

/**
 * @typedef {Object} LocationReading
 * @property {number} latitude  Decimal degrees, -90..90.
 * @property {number} longitude Decimal degrees, -180..180.
 * @property {number} accuracy  Reported horizontal accuracy radius in meters (> 0).
 * @property {number} timestamp Epoch milliseconds when the fix was taken.
 */

/**
 * @typedef {Object} ReadingCheck
 * @property {boolean} valid
 * @property {string|null} reason
 * @property {string} message
 * @property {number} [ageMs]
 * @property {number} [accuracyMeters]
 */

/**
 * @typedef {Object} AcquiredLocation
 * @property {LocationReading} reading
 * @property {boolean} precisionMet  True only when the reported accuracy met the target.
 * @property {number} attempts
 * @property {number} elapsedMs
 */

/**
 * @typedef {Object} AcquisitionProgress
 * @property {"requesting"|"reading"|"invalid"|"rejected"|"retrying"} phase
 * @property {number} attempt
 * @property {number} maxAttempts
 * @property {string} [reason]
 * @property {number} [accuracyMeters]
 * @property {number} [bestAccuracyMeters]
 * @property {number} [elapsedMs]
 */

// ---- Quality targets (accuracy), independent of the attendance radius ----
/** @type {Readonly<{targetAccuracyMeters: number, maxReadingAgeMs: number, futureTimestampToleranceMs: number, attendanceRadiusMeters: number}>} */
export const LOCATION_QUALITY = Object.freeze({
  /** Readings at or under this reported accuracy (meters) count as good quality. */
  targetAccuracyMeters: 50,
  /** A reading older than this is stale and must never be reused as current. */
  maxReadingAgeMs: 30000,
  /** Tolerance for device clocks that are a little ahead of the page clock. */
  futureTimestampToleranceMs: 1000,
  /** Attendance radius, owned by the server. Kept here for UI copy/tests only. */
  attendanceRadiusMeters: 100,
});

// ---- How readings are requested ----
/** @type {Readonly<{enableHighAccuracy: boolean, maximumAgeMs: number, perReadingTimeoutMs: number, totalTimeoutMs: number, maxAttempts: number, acceptTargetAccuracyMeters: number}>} */
export const LOCATION_ACQUISITION = Object.freeze({
  /** Ask the platform for its most accurate fix. Not a guarantee of accuracy. */
  enableHighAccuracy: true,
  /** Never accept a cached position: every call must produce a fresh fix. */
  maximumAgeMs: 0,
  /** Per-call browser timeout (milliseconds). */
  perReadingTimeoutMs: 12000,
  /** Total bounded window for all readings (milliseconds). */
  totalTimeoutMs: 30000,
  /** Upper bound on sequential readings. */
  maxAttempts: 3,
  /** Stop collecting as soon as a reading is this accurate or better. */
  acceptTargetAccuracyMeters: 50,
});

export const LOCATION_REASONS = Object.freeze({
  UNAVAILABLE: "LOCATION_UNAVAILABLE",
  PERMISSION_DENIED: "LOCATION_PERMISSION_DENIED",
  TIMEOUT: "LOCATION_TIMEOUT",
  INVALID: "INVALID_LOCATION",
  STALE: "STALE_LOCATION",
  LOW_ACCURACY: "LOW_ACCURACY",
  INSTRUCTOR_LOW_ACCURACY: "INSTRUCTOR_LOW_ACCURACY",
  OUTSIDE_RADIUS: "OUTSIDE_RADIUS",
  LECTURE_LOCATION_INVALID: "LECTURE_LOCATION_INVALID",
  LECTURE_LOCATION_STALE: "LECTURE_LOCATION_STALE",
  LECTURE_LOCATION_MISSING: "LECTURE_LOCATION_MISSING",
});

/**
 * Human-readable explanation for a location reason code.
 * @param {string} reason
 * @param {{accuracyMeters?: number, targetMeters?: number, ageMs?: number, timeoutMs?: number}} [details]
 * @returns {string}
 */
export function describeLocationReason(reason, details = {}) {
  const target = Math.round(details.targetMeters ?? LOCATION_QUALITY.targetAccuracyMeters);
  const accuracy =
    typeof details.accuracyMeters === "number" && Number.isFinite(details.accuracyMeters)
      ? Math.round(details.accuracyMeters)
      : null;
  const seconds = Math.round((details.timeoutMs ?? LOCATION_ACQUISITION.totalTimeoutMs) / 1000);

  switch (reason) {
    case LOCATION_REASONS.UNAVAILABLE:
      return "Location services are unavailable in this browser, so no reading could be requested.";
    case LOCATION_REASONS.PERMISSION_DENIED:
      return "Location permission was denied. Allow location access for this site in the browser settings, then retry.";
    case LOCATION_REASONS.TIMEOUT:
      return `No location reading arrived within ${seconds} s. Turn on device location, move near a window or outdoors, then retry.`;
    case LOCATION_REASONS.INVALID:
      return "The browser returned invalid location data (coordinates, accuracy, or timestamp). Retry to request a new reading.";
    case LOCATION_REASONS.STALE:
      return "The browser returned an old location reading. Retry to request a fresh one.";
    case LOCATION_REASONS.LOW_ACCURACY:
      return `The best reading was ${accuracy === null ? "above the quality target" : `±${accuracy} m`}, which is worse than the ${target} m quality target. Accuracy is an estimate, so a high-accuracy request is not a guarantee; move outdoors or near a window and retry.`;
    case LOCATION_REASONS.INSTRUCTOR_LOW_ACCURACY:
      return "The instructor's session reference reading is too imprecise to verify anyone's distance. Ask the instructor to refresh their location and start a new session.";
    case LOCATION_REASONS.OUTSIDE_RADIUS:
      return `Your position is more than ${Math.round(details.radiusMeters ?? LOCATION_QUALITY.attendanceRadiusMeters)} m from the lecture hall. This attempt was rejected.`;
    case LOCATION_REASONS.LECTURE_LOCATION_INVALID:
      return "The lecture-hall location is invalid (coordinates or confirmation timestamp out of range). Ask the instructor to confirm the lecture location again.";
    case LOCATION_REASONS.LECTURE_LOCATION_STALE:
      return "The confirmed lecture-hall location is too old for this session. Ask the instructor to confirm the lecture location again.";
    case LOCATION_REASONS.LECTURE_LOCATION_MISSING:
      return "No lecture-hall location has been confirmed for this session.";
    default:
      return reason || "Location could not be obtained.";
  }
}

/** Error carrying a machine-readable reason code plus a human message. */
export class LocationError extends Error {
  /**
   * @param {string} reason
   * @param {string} [message]
   * @param {{accuracyMeters?: number, targetMeters?: number, ageMs?: number, timeoutMs?: number, attempts?: number, elapsedMs?: number}} [details]
   */
  constructor(reason, message, details = {}) {
    super(message || describeLocationReason(reason, details));
    this.name = "LocationError";
    this.reason = reason;
    this.details = details;
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Convert a GeolocationPosition into a plain reading. Missing numbers become NaN
 * so that validateReading() rejects them instead of silently accepting 0/undefined.
 * @param {{coords?: {latitude?: number, longitude?: number, accuracy?: number}, timestamp?: number}|null|undefined} position
 * @returns {LocationReading}
 */
export function toReading(position) {
  const coords = (position && position.coords) || {};
  return {
    latitude: typeof coords.latitude === "number" ? coords.latitude : NaN,
    longitude: typeof coords.longitude === "number" ? coords.longitude : NaN,
    accuracy: typeof coords.accuracy === "number" ? coords.accuracy : NaN,
    timestamp: typeof position?.timestamp === "number" && position.timestamp > 0 ? position.timestamp : NaN,
  };
}

/**
 * Validate one reading: numbers, coordinate ranges, positive accuracy, and
 * freshness. Accuracy above the target is a *quality* problem, not an invalid
 * reading, so it is not reported here.
 * @param {Partial<LocationReading>|null|undefined} reading
 * @param {{now?: number, maxReadingAgeMs?: number, futureTimestampToleranceMs?: number, requireFresh?: boolean}} [options]
 * @returns {ReadingCheck}
 */
export function validateReading(reading, options = {}) {
  const now = options.now ?? Date.now();
  const maxReadingAgeMs = options.maxReadingAgeMs ?? LOCATION_QUALITY.maxReadingAgeMs;
  const futureToleranceMs = options.futureTimestampToleranceMs ?? LOCATION_QUALITY.futureTimestampToleranceMs;
  const requireFresh = options.requireFresh !== false;

  if (!reading || typeof reading !== "object") {
    return { valid: false, reason: LOCATION_REASONS.INVALID, message: describeLocationReason(LOCATION_REASONS.INVALID) };
  }

  const { latitude, longitude, accuracy, timestamp } = /** @type {LocationReading} */ (reading);
  if (![latitude, longitude, accuracy, timestamp].every(isFiniteNumber)) {
    return {
      valid: false,
      reason: LOCATION_REASONS.INVALID,
      message: "The reading is missing a numeric latitude, longitude, accuracy, or timestamp.",
    };
  }
  if (latitude < -90 || latitude > 90) {
    return { valid: false, reason: LOCATION_REASONS.INVALID, message: `Latitude ${latitude} is outside -90..90.` };
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, reason: LOCATION_REASONS.INVALID, message: `Longitude ${longitude} is outside -180..180.` };
  }
  if (!(accuracy > 0)) {
    return {
      valid: false,
      reason: LOCATION_REASONS.INVALID,
      message: `Reported accuracy ${accuracy} m is not a positive distance, so the reading cannot be trusted.`,
    };
  }
  if (!(timestamp > 0)) {
    return { valid: false, reason: LOCATION_REASONS.INVALID, message: "The reading has no capture timestamp." };
  }

  const ageMs = now - timestamp;
  if (ageMs < -futureToleranceMs) {
    return {
      valid: false,
      reason: LOCATION_REASONS.INVALID,
      message: `The reading timestamp is ${Math.round(-ageMs / 1000)} s in the future.`,
    };
  }

  const effectiveAgeMs = Math.max(ageMs, 0);
  if (requireFresh && effectiveAgeMs > maxReadingAgeMs) {
    return {
      valid: false,
      reason: LOCATION_REASONS.STALE,
      message: `The reading is ${(effectiveAgeMs / 1000).toFixed(1)} s old; the freshness limit is ${Math.round(maxReadingAgeMs / 1000)} s.`,
      ageMs: effectiveAgeMs,
    };
  }

  return {
    valid: true,
    reason: null,
    message: `Reading is valid (±${Math.round(accuracy)} m, ${(effectiveAgeMs / 1000).toFixed(1)} s old).`,
    ageMs: effectiveAgeMs,
    accuracyMeters: accuracy,
  };
}

/**
 * Pick the most accurate fresh, valid reading. Stale or invalid readings are
 * ignored entirely — they are never promoted to "current".
 * @param {Array<Partial<LocationReading>>} readings
 * @param {{now?: number, maxReadingAgeMs?: number, futureTimestampToleranceMs?: number}} [options]
 * @returns {LocationReading|null}
 */
export function pickBestReading(readings, options = {}) {
  if (!Array.isArray(readings)) return null;
  let best = null;
  for (const candidate of readings) {
    const check = validateReading(candidate, options);
    if (!check.valid) continue;
    const reading = /** @type {LocationReading} */ (candidate);
    if (!best || reading.accuracy < best.accuracy) best = reading;
  }
  return best;
}

/**
 * Format a reported accuracy for display.
 * @param {number|null|undefined} meters
 * @returns {string}
 */
export function formatAccuracy(meters) {
  if (!isFiniteNumber(/** @type {number} */ (meters)) || /** @type {number} */ (meters) <= 0) return "not reported";
  return `±${Math.round(/** @type {number} */ (meters))} m`;
}

// ============================================================
// Lecture-hall reference location (selected on the map by the instructor)
//
// The professor's laptop GPS may be far too imprecise for a 100 m radius, so the
// reference point for a session is a *confirmed map pin* for the lecture hall.
// It is an administrative reference, not proof that the professor is standing
// there, and it carries no GPS accuracy requirement.
// ============================================================

/** @type {Readonly<{source: string, maxConfirmationAgeMs: number, futureToleranceMs: number}>} */
export const LECTURE_LOCATION = Object.freeze({
  /** Marker for references chosen on the map rather than from device GPS. */
  source: "map",
  /** A confirmed hall must have been confirmed within this window before a start. */
  maxConfirmationAgeMs: 60 * 60 * 1000,
  /** Tolerance for a device clock slightly ahead of the page clock. */
  futureToleranceMs: 60000,
});

/**
 * True when both values are finite numbers inside WGS-84 ranges.
 * @param {unknown} latitude
 * @param {unknown} longitude
 * @returns {boolean}
 */
export function isValidCoordinatePair(latitude, longitude) {
  return (
    isFiniteNumber(/** @type {number} */ (latitude)) &&
    isFiniteNumber(/** @type {number} */ (longitude)) &&
    /** @type {number} */ (latitude) >= -90 &&
    /** @type {number} */ (latitude) <= 90 &&
    /** @type {number} */ (longitude) >= -180 &&
    /** @type {number} */ (longitude) <= 180
  );
}

/**
 * Validate the instructor's confirmed lecture-hall reference.
 * No accuracy field is required: map selection is deliberate, not measured.
 * @param {{latitude?: number, longitude?: number, confirmedAt?: number}|null|undefined} location
 * @param {{now?: number, maxConfirmationAgeMs?: number, futureToleranceMs?: number}} [options]
 * @returns {{valid: boolean, reason: string|null, message: string, ageMs?: number}}
 */
export function validateLectureLocation(location, options = {}) {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxConfirmationAgeMs ?? LECTURE_LOCATION.maxConfirmationAgeMs;
  const futureToleranceMs = options.futureToleranceMs ?? LECTURE_LOCATION.futureToleranceMs;

  if (!location || typeof location !== "object") {
    return { valid: false, reason: LOCATION_REASONS.LECTURE_LOCATION_MISSING, message: "No lecture location was supplied." };
  }
  if (!isValidCoordinatePair(location.latitude, location.longitude)) {
    return {
      valid: false,
      reason: LOCATION_REASONS.LECTURE_LOCATION_INVALID,
      message: `Lecture location (${location.latitude}, ${location.longitude}) is outside the valid latitude/longitude ranges.`,
    };
  }
  if (!isFiniteNumber(/** @type {number} */ (location.confirmedAt)) || /** @type {number} */ (location.confirmedAt) <= 0) {
    return {
      valid: false,
      reason: LOCATION_REASONS.LECTURE_LOCATION_INVALID,
      message: "The lecture location has no confirmation timestamp.",
    };
  }
  const ageMs = now - /** @type {number} */ (location.confirmedAt);
  if (ageMs < -futureToleranceMs) {
    return {
      valid: false,
      reason: LOCATION_REASONS.LECTURE_LOCATION_INVALID,
      message: "The lecture location confirmation timestamp is in the future.",
    };
  }
  if (Math.max(ageMs, 0) > maxAgeMs) {
    return {
      valid: false,
      reason: LOCATION_REASONS.LECTURE_LOCATION_STALE,
      message: `The lecture location was confirmed ${(Math.max(ageMs, 0) / 60000).toFixed(0)} min ago; confirm it again (limit ${Math.round(maxAgeMs / 60000)} min).`,
      ageMs: Math.max(ageMs, 0),
    };
  }
  return { valid: true, reason: null, message: "Lecture location confirmed.", ageMs: Math.max(ageMs, 0) };
}

/**
 * Decide a student submission against the confirmed lecture hall.
 *
 * This mirrors the order used by the n8n `Validate Submission` code node and is
 * used by the tests to keep both implementations honest. The workflow remains
 * the authority: it recalculates this from stored session state.
 *
 * Order: lecture reference -> reading validity/freshness -> student accuracy ->
 * distance. Accuracy problems are never reported as being outside the radius.
 *
 * @param {{
 *   lectureLocation?: {latitude: number, longitude: number, confirmedAt?: number}|null,
 *   student?: Partial<LocationReading>|null,
 *   now?: number,
 *   radiusMeters?: number,
 *   maxAccuracyMeters?: number
 * }} input
 * @returns {{
 *   status: "ACCEPTED"|"REJECTED",
 *   locationStatus: "VERIFIED"|string,
 *   reason: string|null,
 *   distanceMeters: number|null,
 *   accuracyMeters: number|null
 * }}
 */
export function assessStudentAttendance(input = {}) {
  const now = input.now ?? Date.now();
  const radiusMeters = input.radiusMeters ?? LOCATION_QUALITY.attendanceRadiusMeters;
  const maxAccuracyMeters = input.maxAccuracyMeters ?? LOCATION_QUALITY.targetAccuracyMeters;

  const rejected = (reason, distanceMeters = null, accuracyMeters = null) => ({
    status: "REJECTED",
    locationStatus: reason,
    reason,
    distanceMeters,
    accuracyMeters,
  });

  // The lecture reference may arrive without confirmedAt when it was stored by
  // an older session; only coordinates are mandatory here.
  if (!input.lectureLocation) return rejected(LOCATION_REASONS.LECTURE_LOCATION_MISSING);
  if (!isValidCoordinatePair(input.lectureLocation.latitude, input.lectureLocation.longitude)) {
    return rejected(LOCATION_REASONS.LECTURE_LOCATION_INVALID);
  }

  if (!input.student) return rejected(LOCATION_REASONS.UNAVAILABLE);

  const check = validateReading(input.student, { now });
  if (!check.valid) {
    const reason = check.reason === LOCATION_REASONS.STALE ? LOCATION_REASONS.STALE : check.reason || LOCATION_REASONS.INVALID;
    return rejected(reason);
  }

  const accuracyMeters = /** @type {number} */ (input.student.accuracy);
  if (accuracyMeters > maxAccuracyMeters) {
    return rejected(LOCATION_REASONS.LOW_ACCURACY, null, accuracyMeters);
  }

  const distanceMeters = haversineMeters(input.lectureLocation, {
    latitude: /** @type {number} */ (input.student.latitude),
    longitude: /** @type {number} */ (input.student.longitude),
  });
  if (distanceMeters > radiusMeters) {
    return rejected(LOCATION_REASONS.OUTSIDE_RADIUS, distanceMeters, accuracyMeters);
  }

  return { status: "ACCEPTED", locationStatus: "VERIFIED", reason: null, distanceMeters, accuracyMeters };
}

/**
 * Great-circle distance in meters (Haversine, mean Earth radius 6371000 m).
 * @param {{latitude: number, longitude: number}} a
 * @param {{latitude: number, longitude: number}} b
 * @returns {number}
 */
export function haversineMeters(a, b) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Compare a distance against the attendance radius. Display/test helper only:
 * the server makes the real decision.
 * @param {number} distanceMeters
 * @param {number} [radiusMeters]
 * @returns {boolean}
 */
export function isWithinAttendanceRadius(distanceMeters, radiusMeters = LOCATION_QUALITY.attendanceRadiusMeters) {
  return isFiniteNumber(distanceMeters) && distanceMeters <= radiusMeters;
}

/**
 * Map a GeolocationPositionError to one of our reason codes.
 * @param {{code?: number}|null|undefined} error
 * @returns {string}
 */
export function geolocationErrorReason(error) {
  if (error && error.code === 1) return LOCATION_REASONS.PERMISSION_DENIED;
  if (error && error.code === 3) return LOCATION_REASONS.TIMEOUT;
  return LOCATION_REASONS.UNAVAILABLE;
}

/**
 * Collect multiple fresh readings over a bounded window and return the best
 * valid one.
 *
 * - Every attempt uses { enableHighAccuracy: true, maximumAge: 0, timeout }.
 * - Collection stops as soon as a reading meets `acceptTargetAccuracyMeters`,
 *   when `maxAttempts` is reached, or when `totalTimeoutMs` elapses.
 * - A denied permission aborts immediately (retrying cannot help).
 * - With `allowPoorAccuracy: false` (the student flow) a best reading above the
 *   target rejects with LOW_ACCURACY instead of silently accepting it.
 *   With `allowPoorAccuracy: true` (the instructor flow) it resolves with
 *   `precisionMet: false` so the existing REVIEW policy can still apply.
 *
 * @param {Geolocation|{getCurrentPosition: Function}|null|undefined} geolocation
 * @param {Partial<typeof LOCATION_ACQUISITION> & {
 *   allowPoorAccuracy?: boolean,
 *   maxReadingAgeMs?: number,
 *   futureTimestampToleranceMs?: number,
 *   now?: () => number,
 *   onProgress?: (progress: AcquisitionProgress) => void,
 * }} [options]
 * @returns {Promise<AcquiredLocation>}
 */
export function acquireLocation(geolocation, options = {}) {
  const config = { ...LOCATION_ACQUISITION, ...options };
  const now = options.now ?? (() => Date.now());
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const maxAttempts = Math.max(1, Math.floor(Number(config.maxAttempts) || 1));
  const totalTimeoutMs = Math.max(0, Number(config.totalTimeoutMs) || 0);
  const perReadingTimeoutMs = Math.max(1, Number(config.perReadingTimeoutMs) || 1);
  const targetMeters = isFiniteNumber(config.acceptTargetAccuracyMeters)
    ? Number(config.acceptTargetAccuracyMeters)
    : LOCATION_QUALITY.targetAccuracyMeters;
  const allowPoorAccuracy = Boolean(options.allowPoorAccuracy);

  return new Promise((resolve, reject) => {
    if (!geolocation || typeof geolocation.getCurrentPosition !== "function") {
      reject(new LocationError(LOCATION_REASONS.UNAVAILABLE));
      return;
    }

    const startedAt = now();
    let settled = false;
    let attempt = 0;
    /** @type {{reading: LocationReading, accuracy: number}|null} */
    let best = null;
    let lastInvalidReason = null;
    let lastFailureReason = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    let deadlineTimer = null;

    const elapsedMs = () => now() - startedAt;

    /** @param {(value: any) => void} settle @param {any} value */
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer !== null) clearTimeout(deadlineTimer);
      settle(value);
    };

    /** @param {string} fallbackReason */
    const settleWithBestOrFail = (fallbackReason) => {
      if (best) {
        if (best.accuracy <= targetMeters || allowPoorAccuracy) {
          finish(resolve, {
            reading: best.reading,
            precisionMet: best.accuracy <= targetMeters,
            attempts: attempt,
            elapsedMs: elapsedMs(),
          });
        } else {
          finish(
            reject,
            new LocationError(LOCATION_REASONS.LOW_ACCURACY, undefined, {
              accuracyMeters: best.accuracy,
              targetMeters,
              attempts: attempt,
              elapsedMs: elapsedMs(),
            }),
          );
        }
        return;
      }
      finish(reject, new LocationError(fallbackReason, undefined, { attempts: attempt, elapsedMs: elapsedMs() }));
    };

    const attemptNext = () => {
      if (settled) return;
      if (attempt >= maxAttempts) {
        settleWithBestOrFail(lastInvalidReason || lastFailureReason || LOCATION_REASONS.TIMEOUT);
        return;
      }
      if (attempt > 0 && elapsedMs() >= totalTimeoutMs) {
        settleWithBestOrFail(lastInvalidReason || lastFailureReason || LOCATION_REASONS.TIMEOUT);
        return;
      }

      attempt += 1;
      onProgress({
        phase: "requesting",
        attempt,
        maxAttempts,
        bestAccuracyMeters: best ? best.accuracy : undefined,
        elapsedMs: elapsedMs(),
      });

      let handled = false;
      try {
        geolocation.getCurrentPosition(
          (position) => {
            if (settled || handled) return;
            handled = true;

            const reading = toReading(position);
            const check = validateReading(reading, {
              now: now(),
              maxReadingAgeMs: options.maxReadingAgeMs,
              futureTimestampToleranceMs: options.futureTimestampToleranceMs,
            });

            if (!check.valid) {
              lastInvalidReason = check.reason;
              onProgress({
                phase: "invalid",
                attempt,
                maxAttempts,
                reason: check.reason ?? LOCATION_REASONS.INVALID,
                elapsedMs: elapsedMs(),
              });
              attemptNext();
              return;
            }

            if (!best || reading.accuracy < best.accuracy) best = { reading, accuracy: reading.accuracy };
            onProgress({
              phase: "reading",
              attempt,
              maxAttempts,
              accuracyMeters: reading.accuracy,
              bestAccuracyMeters: best.accuracy,
              elapsedMs: elapsedMs(),
            });

            if (best.accuracy <= targetMeters) {
              finish(resolve, {
                reading: best.reading,
                precisionMet: true,
                attempts: attempt,
                elapsedMs: elapsedMs(),
              });
              return;
            }

            onProgress({
              phase: "retrying",
              attempt,
              maxAttempts,
              accuracyMeters: reading.accuracy,
              bestAccuracyMeters: best.accuracy,
              reason: LOCATION_REASONS.LOW_ACCURACY,
              elapsedMs: elapsedMs(),
            });
            attemptNext();
          },
          (error) => {
            if (settled || handled) return;
            handled = true;

            const reason = geolocationErrorReason(error);
            lastFailureReason = reason;
            onProgress({ phase: "rejected", attempt, maxAttempts, reason, elapsedMs: elapsedMs() });

            if (reason === LOCATION_REASONS.PERMISSION_DENIED) {
              finish(reject, new LocationError(reason, undefined, { attempts: attempt, elapsedMs: elapsedMs() }));
              return;
            }
            attemptNext();
          },
          {
            enableHighAccuracy: config.enableHighAccuracy !== false,
            maximumAge: Math.max(0, Number(config.maximumAgeMs) || 0),
            timeout: perReadingTimeoutMs,
          },
        );
      } catch (error) {
        finish(
          reject,
          new LocationError(LOCATION_REASONS.UNAVAILABLE, "The browser refused the location request.", {
            attempts: attempt,
            elapsedMs: elapsedMs(),
          }),
        );
      }
    };

    if (totalTimeoutMs > 0) {
      deadlineTimer = setTimeout(() => {
        if (settled) return;
        if (best && best.accuracy <= targetMeters) {
          finish(resolve, {
            reading: best.reading,
            precisionMet: true,
            attempts: attempt,
            elapsedMs: elapsedMs(),
          });
          return;
        }
        settleWithBestOrFail(lastInvalidReason || lastFailureReason || LOCATION_REASONS.TIMEOUT);
      }, totalTimeoutMs);
    }

    attemptNext();
  });
}

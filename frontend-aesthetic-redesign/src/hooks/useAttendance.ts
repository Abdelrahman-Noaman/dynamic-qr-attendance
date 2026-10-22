import { useCallback, useEffect, useRef, useState } from "react";
import { N8N, STUDENT_URL } from "../config";
import {
  isReadingFresh,
  LOCATION_QUALITY,
  progressText,
  requestInstructorLocation,
  toLocationFailure,
  type LocationProgress,
  type LocationReading,
} from "../utils/location";

export const MAX_GPS_ACCURACY_METERS = LOCATION_QUALITY.targetAccuracyMeters;
export let LOCATION_QUALITY_POLICY: "REVIEW" | "REJECT" = "REVIEW";
export type LocationQualityStatus = "VERIFIED" | "NEEDS_REVIEW" | "REJECTED";

export type Tone = "idle" | "running" | "stopped" | "error";

export interface Status {
  msg: string;
  tone: Tone;
  id: number;
}

export interface QrPayload {
  url: string;
  sessionId: string;
  token: string;
  lecture: string;
  durationMs: number;
  seq: number;
  locationStats: {
    verified: number;
    outsideRadius: number;
    needsReview: number;
  };
}

interface ApiResponse {
  ok?: boolean;
  error?: string;
  active?: boolean;
  lecture?: string;
  sessionId?: string;
  token?: string;
  expiresInMs?: number;
  attendanceRadiusMeters?: number;
  locationStats?: QrPayload["locationStats"];
  locationQualityStatus?: LocationQualityStatus;
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function parseResponse(res: Response): Promise<ApiResponse> {
  const text = await res.text();
  let data: ApiResponse | null = null;

  try {
    data = text ? (JSON.parse(text) as ApiResponse) : null;
  } catch {
    // Keep the HTTP status as the useful diagnostic when the server returns non-JSON.
  }

  if (!res.ok) {
    const detail = data?.error || text || res.statusText;
    throw new ApiRequestError(`Request failed (${res.status}): ${detail}`, res.status);
  }

  if (!data) {
    throw new ApiRequestError("Request returned an empty response", res.status);
  }

  return data;
}

// ---- API helpers (same contract as the original page) ----
async function apiPost(endpoint: string, body: Record<string, string>): Promise<ApiResponse> {
  const res = await fetch(`${N8N}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return parseResponse(res);
}

async function apiGet(endpoint: string, params: Record<string, string>): Promise<ApiResponse> {
  const url = `${N8N}/${endpoint}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  return parseResponse(res);
}

export function useAttendance(key: string | null) {
  const [lecture, setLecture] = useState("Data Security");
  const [status, setStatusState] = useState<Status>({ msg: "", tone: "idle", id: 0 });
  const [startDisabled, setStartDisabled] = useState(false);
  const [stopDisabled, setStopDisabled] = useState(true);
  const [lectureDisabled, setLectureDisabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [running, setRunningState] = useState(false);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [tokensServed, setTokensServed] = useState(0);
  const [instructorLocation, setInstructorLocation] = useState<LocationReading | null>(null);
  const [locationStatus, setLocationStatus] = useState("Location is required before starting.");
  const [locationQualityStatus, setLocationQualityStatus] =
    useState<LocationQualityStatus>("REJECTED");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationStats, setLocationStats] = useState<QrPayload["locationStats"]>({
    verified: 0,
    outsideRadius: 0,
    needsReview: 0,
  });
  const [attendanceRadiusMeters, setAttendanceRadiusMeters] = useState(100);

  const runningRef = useRef(false);
  const stoppingRef = useRef(false);
  const refreshTimer = useRef<number | undefined>(undefined);
  const seqRef = useRef(0);
  const lastTokenRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const missRef = useRef(0);
  const epochRef = useRef(0);
  const fetchQRRef = useRef<() => Promise<void>>(async () => {});

  const setStatus = useCallback((msg: string, tone: Tone) => {
    idRef.current += 1;
    setStatusState({ msg, tone, id: idRef.current });
  }, []);

  const setRunning = useCallback((v: boolean) => {
    runningRef.current = v;
    setRunningState(v);
  }, []);

  const hideQR = useCallback(() => {
    setQr(null);
    lastTokenRef.current = null;
  }, []);

  const showQR = useCallback((data: ApiResponse) => {
    const sessionId = String(data.sessionId ?? "");
    const token = String(data.token ?? "");
    const url = `${STUDENT_URL}?s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(token)}`;
    seqRef.current += 1;
    if (lastTokenRef.current !== token) {
      lastTokenRef.current = token;
      setTokensServed((n) => n + 1);
    }
    setQr({
      url,
      sessionId,
      token,
      lecture: data.lecture || "Lecture",
      durationMs: data.expiresInMs || 10000,
      seq: seqRef.current,
      locationStats: data.locationStats || locationStats,
    });
  }, [locationStats]);

  // Active session → show QR, lock controls, and schedule the next token fetch
  const applyActive = useCallback(
    (data: ApiResponse) => {
      missRef.current = 0;
      setRunning(true);
      setStartDisabled(true);
      setStopDisabled(false);
      setLectureDisabled(true);
      setLecture(data.lecture || "Lecture");
      setLocationStats(data.locationStats || locationStats);
      setAttendanceRadiusMeters(data.attendanceRadiusMeters || 100);
      if (data.locationQualityStatus) {
        setLocationQualityStatus(data.locationQualityStatus);
      }

      showQR(data);
      setStatus(`Running — ${data.lecture || "Lecture"}`, "running");

      // Schedule next fetch at expiresInMs + 200ms
      const delay = (data.expiresInMs || 10000) + 200;
      clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => fetchQRRef.current(), delay);
    },
    [locationStats, setRunning, setStatus, showQR]
  );

  // ---- Fetch QR / token ----
  const fetchQR = useCallback(async () => {
    if (!key) return;
    clearTimeout(refreshTimer.current);
    const epoch = epochRef.current;

    try {
      const data = await apiGet("dqr-qr", { key });
      if (epoch !== epochRef.current || stoppingRef.current) return;

      if (!data.ok) {
        const detail =
          data.error === "unauthorized"
            ? "Wrong key"
            : data.error || "Unknown server error";
        setStatus(`QR refresh failed: ${detail}`, "error");
        return;
      }

      if (!data.active) {
        if (!runningRef.current) {
          hideQR();
          return;
        }
        // We thought a session was live, but the server disagrees. Give it a few polls.
        missRef.current += 1;
        if (missRef.current >= 3) {
          setRunning(false);
          hideQR();
          setStatus("Session ended", "stopped");
          setStartDisabled(false);
          setStopDisabled(true);
          setLectureDisabled(false);
        } else {
          refreshTimer.current = window.setTimeout(() => fetchQRRef.current(), 2000);
        }
        return;
      }

      applyActive(data);
    } catch (error) {
      if (epoch !== epochRef.current || stoppingRef.current) return;
      setStatus(
        error instanceof ApiRequestError
          ? error.message
          : "Network error — retrying in 5s",
        "error"
      );
      refreshTimer.current = window.setTimeout(() => fetchQRRef.current(), 5000);
    }
  }, [key, applyActive, hideQR, setRunning, setStatus]);

  useEffect(() => {
    fetchQRRef.current = fetchQR;
  }, [fetchQR]);

  // ---- Init: resume a running session after refresh ----
  useEffect(() => {
    if (!key) return;
    epochRef.current += 1;

    if (N8N.includes("YOUR_N8N_HOST")) {
      setStatus("Configure the n8n webhook URL in src/config.ts first", "error");
      return;
    }

    fetchQRRef.current = fetchQR;
    fetchQR();

    return () => {
      epochRef.current += 1;
      clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ---- Location (instructor) ----
  // Same shared acquisition module as the student page: high accuracy, no
  // cached fixes, up to three readings inside a bounded window, best fresh
  // reading wins. A reading older than the freshness limit is re-acquired
  // instead of being reused.
  type InstructorLocationResult =
    | { ok: true; reading: LocationReading; precisionMet: boolean; attempts: number }
    | { ok: false; reason: string; message: string };

  const acquireInstructorLocation = useCallback(async (): Promise<InstructorLocationResult> => {
    setLocationBusy(true);
    setLocationStatus("Requesting a fresh high-accuracy reading…");

    try {
      const acquired = await requestInstructorLocation((progress: LocationProgress) => {
        setLocationStatus(progressText(progress));
      });
      const reading = acquired.reading;
      const accuracy = Math.round(reading.accuracy);
      const target = LOCATION_QUALITY.targetAccuracyMeters;
      const readings = `${acquired.attempts} reading${acquired.attempts === 1 ? "" : "s"}`;

      setInstructorLocation(reading);
      if (acquired.precisionMet) {
        setLocationQualityStatus("VERIFIED");
        setLocationStatus(
          `Location ready · reported accuracy ±${accuracy} m (quality target ≤${target} m, ${readings}). ` +
            "Accuracy is a device estimate, not a guarantee."
        );
      } else {
        setLocationQualityStatus("NEEDS_REVIEW");
        setLocationStatus(
          `NEEDS_REVIEW · best reported accuracy ±${accuracy} m is above the ${target} m target after ${readings}. ` +
            "You may start, but students cannot be distance-verified against this reference " +
            "(their attempts are rejected as INSTRUCTOR_LOW_ACCURACY). Refresh the location or move outdoors."
        );
      }

      return { ok: true, reading, precisionMet: acquired.precisionMet, attempts: acquired.attempts };
    } catch (error) {
      const failure = toLocationFailure(error);
      setInstructorLocation(null);
      setLocationQualityStatus("REJECTED");
      setLocationStatus(`${failure.message} [reason: ${failure.reason}]`);
      return { ok: false, reason: failure.reason, message: failure.message };
    } finally {
      setLocationBusy(false);
    }
  }, []);

  const shareLocation = useCallback(() => {
    void acquireInstructorLocation();
  }, [acquireInstructorLocation]);

  const startSession = useCallback(async () => {
    if (!key) return;

    // Never send an old reading as if it were current: a missing or stale
    // reading is replaced by a fresh acquisition before the start request.
    let reading = instructorLocation;
    let precisionMet = locationQualityStatus === "VERIFIED";

    if (!reading || !isReadingFresh(reading)) {
      setStatus(
        reading
          ? "Your saved location reading is stale — requesting a fresh one…"
          : "A valid location reading is required before starting — requesting one…",
        "running"
      );
      setInstructorLocation(null);
      setLocationQualityStatus("REJECTED");
      const acquired = await acquireInstructorLocation();
      if (!acquired.ok) {
        setStatus(
          `Session start needs a fresh location reading. ${acquired.message} [reason: ${acquired.reason}]`,
          "error"
        );
        setStartDisabled(false);
        return;
      }
      reading = acquired.reading;
      precisionMet = acquired.precisionMet;
    }

    if (!precisionMet && LOCATION_QUALITY_POLICY === "REJECT") {
      setStatus(
        `A location reading with accuracy ≤${LOCATION_QUALITY.targetAccuracyMeters} m is required before starting.`,
        "error"
      );
      return;
    }
    setStartDisabled(true);
    setStarting(true);
    setStatus("Starting…", "running");

    try {
      const data = await apiPost("dqr-start", {
        key,
        lecture: lecture.trim() || "Lecture",
        instructorLatitude: String(reading.latitude),
        instructorLongitude: String(reading.longitude),
        instructorAccuracy: String(reading.accuracy),
        instructorLocationTimestamp: String(reading.timestamp),
        locationQualityPolicy: LOCATION_QUALITY_POLICY,
      });

      if (!data.ok) {
        const reason = data.error || "UNKNOWN_START_ERROR";
        if (
          reason === "LOW_ACCURACY" ||
          reason === "STALE_LOCATION" ||
          reason === "INVALID_LOCATION" ||
          reason === "LOCATION_UNAVAILABLE"
        ) {
          setInstructorLocation(null);
          setLocationQualityStatus("REJECTED");
          setLocationStatus(`REJECTED · Server refused the instructor location: ${reason}. Refresh and retry.`);
        }
        setStatus(
          reason === "unauthorized"
            ? "Session start rejected: wrong key"
            : `Session start rejected: ${reason}`,
          "error"
        );
        setStartDisabled(false);
        setStarting(false);
        return;
      }

      setLecture(data.lecture || lecture.trim() || "Lecture");
      if (data.locationQualityStatus) {
        setLocationQualityStatus(data.locationQualityStatus);
      }
      setRunning(true);
      setStarting(false);
      setStopDisabled(false);
      setLectureDisabled(true);
      setStatus(
        data.locationQualityStatus === "NEEDS_REVIEW"
          ? "Session started with location review required"
          : "Session started",
        data.locationQualityStatus === "NEEDS_REVIEW" ? "stopped" : "running"
      );
      await fetchQR();
    } catch (error) {
      setStatus(
        error instanceof ApiRequestError
          ? error.message
          : "Network error — is n8n reachable?",
        "error"
      );
      setStartDisabled(false);
      setStarting(false);
    }
  }, [
    key,
    lecture,
    instructorLocation,
    locationQualityStatus,
    acquireInstructorLocation,
    fetchQR,
    setRunning,
    setStatus,
  ]);

  // ---- Stop ----
  const stopSession = useCallback(async () => {
    if (!key) return;
    setStopDisabled(true);
    stoppingRef.current = true;
    setStopping(true);
    clearTimeout(refreshTimer.current);
    setStatus("Stopping…", "stopped");

    try {
      await apiPost("dqr-stop", { key });
    } catch (error) {
      setStatus(
        error instanceof ApiRequestError
          ? error.message
          : "Network error while stopping",
        "error"
      );
      setStopDisabled(false);
      stoppingRef.current = false;
      setStopping(false);
      fetchQR(); // pick the token refresh cycle back up
      return;
    }

    setRunning(false);

    const finishStopped = (msg: string) => {
      hideQR();
      setStatus(msg, "stopped");
      setStartDisabled(false);
      setLectureDisabled(false);
      stoppingRef.current = false;
      setStopping(false);
    };

    // Wait 1.5s, then verify it's actually stopped
    window.setTimeout(async () => {
      try {
        const data = await apiGet("dqr-qr", { key });
        if (data.ok && data.active) {
          // Still running?! Let the prof try again
          stoppingRef.current = false;
          setStopping(false);
          applyActive(data);
          setStatus("Session still appears active — try Stop again", "error");
        } else {
          finishStopped("Session stopped");
        }
      } catch {
        finishStopped("Session stopped (couldn't verify)");
      }
    }, 1500);
  }, [key, fetchQR, applyActive, hideQR, setRunning, setStatus]);

  return {
    lecture,
    setLecture,
    status,
    startDisabled,
    stopDisabled,
    lectureDisabled,
    starting,
    stopping,
    running,
    qr,
    tokensServed,
    instructorLocation,
    locationStatus,
    locationQualityStatus,
    locationBusy,
    shareLocation,
    attendanceRadiusMeters,
    locationStats,
    startSession,
    stopSession,
  };
}

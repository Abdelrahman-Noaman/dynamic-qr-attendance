import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  describeApiError,
  fetchSession,
  normaliseCounters,
  startSession as startSessionRequest,
  stopSession as stopSessionRequest,
  type LocationCounters,
  type SessionReference,
  type SessionResponse,
} from "../api/attendanceApi";
import { N8N, STUDENT_URL as STUDENT_PAGE } from "../config";
import {
  LOCATION_QUALITY,
  createLectureLocation,
  formatCoordinates,
  isLectureLocationFresh,
  loadLectureLocation,
  saveLectureLocation,
  type LectureLocation,
} from "../utils/lectureLocation";

/** Student-side accuracy ceiling and attendance radius (server-owned values). */
export const MAX_GPS_ACCURACY_METERS = LOCATION_QUALITY.targetAccuracyMeters;
export const ATTENDANCE_RADIUS_METERS = LOCATION_QUALITY.attendanceRadiusMeters;

export type LectureLocationStatus = "CONFIRMED" | "UNCONFIRMED";
export type Tone = "idle" | "running" | "stopped" | "error";
export type SessionPhase = "idle" | "starting" | "live" | "stopping";

export interface Status {
  msg: string;
  tone: Tone;
  /** Bumps on every message so repeated identical text still animates once. */
  id: number;
}

export interface QrPayload {
  /** Full student URL including session + ticket. */
  url: string;
  sessionId: string;
  token: string;
  lecture: string;
  durationMs: number;
  /** Increments on every fresh token; used to restart the countdown. */
  seq: number;
}

const DEFAULT_TOKEN_MS = 10_000;
const POLL_GRACE_MS = 250;
const MISSES_BEFORE_STOP = 3;
const RETRY_BASE_MS = 4_000;
const RETRY_MAX_MS = 20_000;

function normaliseRadius(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 5_000
    ? value
    : ATTENDANCE_RADIUS_METERS;
}

function normaliseDuration(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1_000 && value <= 120_000
    ? value
    : DEFAULT_TOKEN_MS;
}

/** Shared lecture-name validation so the form and the start call agree. */
export function validateLectureName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Enter the lecture name.";
  if (trimmed.length > 60) return "Keep the lecture name to 60 characters or fewer.";
  return null;
}

/**
 * Owns every interaction with the attendance workflow: the live token,
 * session lifecycle, lecture-hall reference and the professor's key state.
 * Views receive derived, read-only values and callbacks — no fetch calls.
 */
export function useAttendance(key: string | null) {
  const [lecture, setLectureState] = useState("");
  const [status, setStatusState] = useState<Status>({ msg: "", tone: "idle", id: 0 });
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [running, setRunningState] = useState(false);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [tokenNo, setTokenNo] = useState(0);
  const [keyRejected, setKeyRejected] = useState(false);
  const [counters, setCounters] = useState<LocationCounters>({
    verified: 0,
    outsideRadius: 0,
    rejected: 0,
  });
  const [attendanceRadiusMeters, setAttendanceRadiusMeters] = useState(ATTENDANCE_RADIUS_METERS);
  // Restored from storage so a refresh does not silently drop the selection;
  // never a hardcoded default.
  const [lectureLocation, setLectureLocation] = useState<LectureLocation | null>(() => loadLectureLocation());
  const [lectureLocationNotice, setLectureLocationNotice] = useState<string | null>(null);

  const runningRef = useRef(false);
  const stoppingRef = useRef(false);
  // Refs, not state: two clicks in the same tick must not both reach the network.
  const startingRef = useRef(false);
  const refreshTimer = useRef<number | undefined>(undefined);
  const verifyTimer = useRef<number | undefined>(undefined);
  const seqRef = useRef(0);
  const lastTokenRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const missRef = useRef(0);
  const retryRef = useRef(0);
  const epochRef = useRef(0);
  const fetchTokenRef = useRef<() => Promise<void>>(async () => {});

  const setStatus = useCallback((msg: string, tone: Tone) => {
    idRef.current += 1;
    setStatusState({ msg, tone, id: idRef.current });
  }, []);

  const setRunning = useCallback((value: boolean) => {
    runningRef.current = value;
    setRunningState(value);
  }, []);

  const clearRefresh = useCallback(() => {
    if (refreshTimer.current !== undefined) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = undefined;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (delay: number) => {
      clearRefresh();
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = undefined;
        void fetchTokenRef.current();
      }, Math.max(0, delay));
    },
    [clearRefresh],
  );

  const hideQr = useCallback(() => {
    setQr(null);
    lastTokenRef.current = null;
  }, []);

  const showToken = useCallback((data: SessionResponse, lectureName: string) => {
    const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
    const token = typeof data.token === "string" ? data.token : "";
    if (!sessionId || !token) return false;

    seqRef.current += 1;
    if (lastTokenRef.current !== token) {
      lastTokenRef.current = token;
      setTokenNo((n) => n + 1);
    }
    setQr({
      url: `${STUDENT_PAGE}?s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(token)}`,
      sessionId,
      token,
      lecture: lectureName,
      durationMs: normaliseDuration(data.expiresInMs),
      seq: seqRef.current,
    });
    return true;
  }, []);

  const adoptReference = useCallback((reference: SessionReference | null | undefined) => {
    if (!reference) return;
    const { latitude, longitude } = reference;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    setLectureLocation((current) =>
      current && current.latitude === latitude && current.longitude === longitude
        ? current
        : createLectureLocation(
            { latitude, longitude },
            { confirmedAt: Number(reference.confirmedAt) || Date.now() },
          ),
    );
  }, []);

  /** Server says a session is live: adopt its state and schedule the next poll. */
  const applyActive = useCallback(
    (data: SessionResponse) => {
      const lectureName = (data.lecture || "").trim() || lecture.trim() || "Lecture";
      if (!showToken(data, lectureName)) {
        setStatus("The attendance service returned an incomplete session — retrying.", "error");
        scheduleRefresh(RETRY_BASE_MS);
        return;
      }

      missRef.current = 0;
      retryRef.current = 0;
      setRunning(true);
      setLectureState((current) => (data.lecture && data.lecture !== current ? data.lecture : current));
      if (data.locationStats) setCounters(normaliseCounters(data.locationStats));
      setAttendanceRadiusMeters(normaliseRadius(data.attendanceRadiusMeters));
      adoptReference(data.lectureLocation);
      setStatus(`Live — ${lectureName}`, "running");
      scheduleRefresh(normaliseDuration(data.expiresInMs) + POLL_GRACE_MS);
    },
    [adoptReference, lecture, scheduleRefresh, setRunning, setStatus, showToken],
  );

  const endSessionLocally = useCallback(() => {
    setRunning(false);
    setStarting(false);
    setStopping(false);
    startingRef.current = false;
    stoppingRef.current = false;
    hideQr();
  }, [hideQr, setRunning]);

  const fetchToken = useCallback(async () => {
    if (!key) return;
    clearRefresh();
    const epoch = epochRef.current;

    try {
      const data = await fetchSession(key);
      if (epoch !== epochRef.current || stoppingRef.current) return;

      if (data.ok === false) {
        if (data.error === "unauthorized") {
          // Stop polling: retrying a rejected key just hammers the workflow.
          setKeyRejected(true);
          endSessionLocally();
          setStatus("The attendance service rejected this key. Unlock again to continue.", "error");
          return;
        }
        setStatus(`Could not read the session: ${data.error || "unknown server error"}.`, "error");
        scheduleRefresh(RETRY_BASE_MS);
        return;
      }

      if (!data.active) {
        if (!runningRef.current) {
          hideQr();
          return;
        }
        // We believed a session was live but the server disagrees. Give it a
        // couple of polls before declaring the session over.
        missRef.current += 1;
        if (missRef.current < MISSES_BEFORE_STOP) {
          scheduleRefresh(2_000);
          return;
        }
        endSessionLocally();
        setStatus("The session has ended.", "stopped");
        return;
      }

      applyActive(data);
    } catch (error) {
      if (epoch !== epochRef.current || stoppingRef.current) return;
      retryRef.current += 1;
      const delay = Math.min(RETRY_BASE_MS * 2 ** (retryRef.current - 1), RETRY_MAX_MS);
      const detail = error instanceof ApiError && error.kind === "timeout" ? error.message : describeApiError(error);
      setStatus(`${detail} Retrying in ${Math.round(delay / 1000)} s.`, "error");
      scheduleRefresh(delay);
    }
  }, [applyActive, clearRefresh, endSessionLocally, hideQr, key, scheduleRefresh, setStatus]);

  useEffect(() => {
    fetchTokenRef.current = fetchToken;
  }, [fetchToken]);

  // ---- Resume after a refresh: ask the workflow whether a session is live ----
  useEffect(() => {
    epochRef.current += 1;
    setKeyRejected(false);
    if (!key) return;

    if (N8N.includes("YOUR_N8N_HOST")) {
      setStatus("Set your n8n webhook URL in src/config.ts before using the dashboard.", "error");
      return;
    }

    void fetchTokenRef.current();

    return () => {
      epochRef.current += 1;
      clearRefresh();
      window.clearTimeout(verifyTimer.current);
    };
  }, [key, clearRefresh, setStatus]);

  // ---- Lecture hall reference (professor-confirmed map pin) ----
  const confirmLectureLocation = useCallback((next: LectureLocation) => {
    const confirmed = createLectureLocation(
      { latitude: next.latitude, longitude: next.longitude },
      { confirmedAt: next.confirmedAt ?? Date.now(), label: next.label },
    );
    setLectureLocation(confirmed);
    saveLectureLocation(confirmed);
    setLectureLocationNotice(
      `Lecture hall confirmed at ${formatCoordinates(confirmed)}. Students are checked against this pin.`,
    );
  }, []);

  const clearLectureLocation = useCallback(() => {
    setLectureLocation(null);
    saveLectureLocation(null);
    setLectureLocationNotice(null);
  }, []);

  const lectureLocationStatus: LectureLocationStatus =
    lectureLocation && isLectureLocationFresh(lectureLocation) ? "CONFIRMED" : "UNCONFIRMED";

  const setLecture = useCallback((value: string) => {
    setLectureState(value.slice(0, 60));
  }, []);

  // ---- Start ----
  const startSession = useCallback(async () => {
    if (!key || startingRef.current || runningRef.current || stoppingRef.current) return;

    const problem = validateLectureName(lecture);
    if (problem) {
      setStatus(problem, "error");
      return;
    }
    // A session may only start from a confirmed, still-valid lecture location.
    // There is no built-in fallback and no stale reuse.
    if (!lectureLocation) {
      setStatus("Confirm the lecture hall on the map before starting.", "error");
      return;
    }
    if (!isLectureLocationFresh(lectureLocation)) {
      setStatus("The confirmed lecture location is stale — confirm the hall again before starting.", "error");
      return;
    }

    startingRef.current = true;
    setStarting(true);
    setStatus("Starting session…", "running");

    try {
      const data = await startSessionRequest({
        key,
        lecture: lecture.trim(),
        latitude: lectureLocation.latitude,
        longitude: lectureLocation.longitude,
        confirmedAt: lectureLocation.confirmedAt,
      });

      if (data.ok === false) {
        const reason = data.error || "UNKNOWN_START_ERROR";
        if (reason === "LECTURE_LOCATION_STALE" || reason === "LECTURE_LOCATION_INVALID") {
          clearLectureLocation();
          setLectureLocationNotice("The service rejected the lecture location. Confirm the hall again.");
        }
        if (reason === "unauthorized") setKeyRejected(true);
        setStatus(
          reason === "unauthorized"
            ? "That key was rejected by the attendance service."
            : `The session could not start: ${reason}.`,
          "error",
        );
        startingRef.current = false;
        setStarting(false);
        return;
      }

      setLectureState((current) => data.lecture || current);
      setRunning(true);
      setStatus("Session started — students can scan now.", "running");
      // Stay in the "starting" state until the first token lands, otherwise
      // the console flickers back to an apparently idle session.
      try {
        await fetchTokenRef.current();
      } finally {
        startingRef.current = false;
        setStarting(false);
      }
    } catch (error) {
      setStatus(describeApiError(error), "error");
      startingRef.current = false;
      setStarting(false);
    }
  }, [clearLectureLocation, key, lecture, lectureLocation, setRunning, setStatus]);

  // ---- Stop (with verification that the workflow really stopped) ----
  const stopSession = useCallback(async () => {
    if (!key || stoppingRef.current) return;
    setStopping(true);
    stoppingRef.current = true;
    clearRefresh();
    setStatus("Stopping session…", "stopped");

    try {
      const data = await stopSessionRequest(key);
      if (data.ok === false && data.error === "unauthorized") {
        setKeyRejected(true);
        endSessionLocally();
        setStatus("The attendance service rejected this key. Unlock again to continue.", "error");
        return;
      }
    } catch (error) {
      setStatus(describeApiError(error), "error");
      stoppingRef.current = false;
      setStopping(false);
      void fetchTokenRef.current(); // resume the token cycle
      return;
    }

    setRunning(false);
    window.clearTimeout(verifyTimer.current);
    verifyTimer.current = window.setTimeout(async () => {
      try {
        const data = await fetchSession(key);
        if (data.ok === false && data.error === "unauthorized") {
          setKeyRejected(true);
          endSessionLocally();
          setStatus("The attendance service rejected this key. Attendance state is unknown.", "error");
          return;
        }
        if (data.active) {
          stoppingRef.current = false;
          setStopping(false);
          applyActive(data);
          setStatus("The service still reports an active session — try Stop again.", "error");
          return;
        }
        endSessionLocally();
        setStatus("Session stopped. Attendance is closed.", "stopped");
      } catch {
        endSessionLocally();
        setStatus("Session stopped, but the service could not be re-checked.", "stopped");
      }
    }, 1_500);
  }, [applyActive, clearRefresh, endSessionLocally, key, setRunning, setStatus]);

  const phase: SessionPhase = starting ? "starting" : stopping ? "stopping" : qr ? "live" : "idle";

  return {
    // session
    lecture,
    setLecture,
    lectureProblem: validateLectureName(lecture),
    status,
    phase,
    running,
    starting,
    stopping,
    qr,
    tokenNo,
    keyRejected,
    // lecture hall
    lectureLocation,
    lectureLocationStatus,
    lectureLocationNotice,
    confirmLectureLocation,
    clearLectureLocation,
    // live data
    attendanceRadiusMeters,
    counters,
    // actions
    startSession,
    stopSession,
  };
}

export type AttendanceController = ReturnType<typeof useAttendance>;

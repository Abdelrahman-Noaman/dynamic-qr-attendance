import { useCallback, useEffect, useRef, useState } from "react";
import { N8N, STUDENT_URL } from "../config";
import {
  LOCATION_QUALITY,
  createLectureLocation,
  formatCoordinates,
  isLectureLocationFresh,
  loadLectureLocation,
  saveLectureLocation,
  type LectureLocation,
} from "../utils/lectureLocation";
import {
  isSpreadsheetResponse,
  readSessionSheet,
  sessionSheetExportEndpoint,
  sessionSheetFileName,
  triggerDownload,
  type SessionSheet,
  type SheetDownloadNotice,
} from "../utils/sessionSheet";

/** Student-side accuracy ceiling and attendance radius (server-owned values). */
export const MAX_GPS_ACCURACY_METERS = LOCATION_QUALITY.targetAccuracyMeters;
export const ATTENDANCE_RADIUS_METERS = LOCATION_QUALITY.attendanceRadiusMeters;

/**
 * How the session's reference point was established. The dashboard only ever
 * sends `map` (a professor-confirmed lecture hall), never device GPS.
 */
export type LectureLocationSource = "map";
export type LectureLocationStatus = "CONFIRMED" | "UNCONFIRMED";

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
    rejected: number;
  };
  /** The reference point stored in the workflow for the live session. */
  lectureLocation?: { latitude: number; longitude: number; source?: string; confirmedAt?: number } | null;
}

interface ApiResponse {
  ok?: boolean;
  error?: string;
  /** Human-readable reason the workflow produced for a failure. */
  detail?: string;
  active?: boolean;
  lecture?: string;
  sessionId?: string;
  token?: string;
  expiresInMs?: number;
  attendanceRadiusMeters?: number;
  locationStats?: QrPayload["locationStats"];
  lectureLocation?: QrPayload["lectureLocation"];
  /** The workbook created for this session, sent by start / qr / stop. */
  attendanceSheet?: Partial<SessionSheet> | null;
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
  // The confirmed lecture hall. Restored from storage so a refresh does not
  // silently drop the professor's selection; never a hardcoded default.
  const [lectureLocation, setLectureLocation] = useState<LectureLocation | null>(() => loadLectureLocation());
  const [lectureLocationNotice, setLectureLocationNotice] = useState<string | null>(null);
  const [locationStats, setLocationStats] = useState<QrPayload["locationStats"]>({
    verified: 0,
    outsideRadius: 0,
    rejected: 0,
  });
  const [attendanceRadiusMeters, setAttendanceRadiusMeters] = useState(100);
  // The workbook this session writes to. The workflow creates it on Start and
  // reports it again on the QR poll and on Stop, so the panel survives a
  // refresh and the professor can still download the sheet after stopping.
  const [attendanceSheet, setAttendanceSheet] = useState<SessionSheet | null>(null);
  const [sheetDownload, setSheetDownload] = useState<SheetDownloadNotice>({ state: "idle", message: "" });

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

  /** Picks up the session workbook whenever the workflow reports one. */
  const applySheet = useCallback((data: ApiResponse) => {
    const sheet = readSessionSheet(data.attendanceSheet);
    if (!sheet) return;
    setAttendanceSheet((current) => (current && current.url === sheet.url ? current : sheet));
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
      durationMs: data.expiresInMs || 15000,
      seq: seqRef.current,
      locationStats: data.locationStats || locationStats,
    });
    applySheet(data);
  }, [applySheet, locationStats]);

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
      setAttendanceRadiusMeters(data.attendanceRadiusMeters || ATTENDANCE_RADIUS_METERS);
      // Keep the map in sync with the reference the server is actually using
      // (e.g. after a page reload mid-session).
      const serverReference = data.lectureLocation;
      if (serverReference && Number.isFinite(serverReference.latitude) && Number.isFinite(serverReference.longitude)) {
        setLectureLocation((current) =>
          current && current.latitude === serverReference.latitude && current.longitude === serverReference.longitude
            ? current
            : createLectureLocation(
                { latitude: Number(serverReference.latitude), longitude: Number(serverReference.longitude) },
                { confirmedAt: Number(serverReference.confirmedAt) || Date.now() },
              ),
        );
      }

      showQR(data);
      setStatus(`Running — ${data.lecture || "Lecture"}`, "running");

      // Schedule next fetch at expiresInMs + 200ms
      const delay = (data.expiresInMs || 15000) + 200;
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
        // A stopped session still reports its workbook, so a refresh after the
        // stop keeps the download available.
        applySheet(data);
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
  }, [key, applyActive, applySheet, hideQR, setRunning, setStatus]);

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

  // ---- Lecture hall reference (professor-selected on the map) ----
  // The laptop's own GPS is deliberately not the reference: ±150 m is common
  // indoors and can never satisfy a 50 m quality gate. The professor confirms a
  // pin for the lecture hall instead; it is an administrative reference, not
  // evidence that the professor is in the room.
  const confirmLectureLocation = useCallback((next: LectureLocation) => {
    const confirmed = createLectureLocation(
      { latitude: next.latitude, longitude: next.longitude },
      { confirmedAt: next.confirmedAt ?? Date.now(), label: next.label },
    );
    setLectureLocation(confirmed);
    saveLectureLocation(confirmed);
    setLectureLocationNotice(
      `Lecture location confirmed · ${formatCoordinates(confirmed)}. This is the lecture hall, not the professor's device position.`,
    );
  }, []);

  const clearLectureLocation = useCallback(() => {
    setLectureLocation(null);
    saveLectureLocation(null);
    setLectureLocationNotice(null);
  }, []);

  const lectureLocationStatus: LectureLocationStatus =
    lectureLocation && isLectureLocationFresh(lectureLocation) ? "CONFIRMED" : "UNCONFIRMED";

  const startSession = useCallback(async () => {
    if (!key) return;

    // A session may only start from a confirmed, still-valid lecture location.
    // There is no built-in fallback and no stale reuse.
    if (!lectureLocation) {
      setStatus("Confirm the lecture hall on the map before starting.", "error");
      return;
    }
    if (!isLectureLocationFresh(lectureLocation)) {
      setStatus("The confirmed lecture location is stale — confirm it again before starting.", "error");
      return;
    }

    setStartDisabled(true);
    setStarting(true);
    setStatus("Starting…", "running");

    try {
      const data = await apiPost("dqr-start", {
        key,
        lecture: lecture.trim() || "Lecture",
        instructorLatitude: String(lectureLocation.latitude),
        instructorLongitude: String(lectureLocation.longitude),
        instructorLocationSource: "map",
        instructorLocationConfirmedAt: String(lectureLocation.confirmedAt),
      });

      if (!data.ok) {
        const reason = data.error || "UNKNOWN_START_ERROR";
        // The workflow reports what actually went wrong (e.g. the Sheets API
        // error behind a refused workbook); show it instead of just the code.
        const detail = data.detail ? ` — ${data.detail}` : "";
        if (
          reason === "LECTURE_LOCATION_INVALID" ||
          reason === "LECTURE_LOCATION_STALE" ||
          reason === "LECTURE_LOCATION_MISSING" ||
          reason === "INVALID_LOCATION"
        ) {
          setLectureLocation(null);
          saveLectureLocation(null);
          setLectureLocationNotice(
            `The server rejected the lecture location (${reason}). Confirm the hall again.`,
          );
        }
        setStatus(
          reason === "unauthorized"
            ? "Session start rejected: wrong key"
            : reason === "WORKBOOK_TEMPLATE_MISMATCH"
              ? `Session not started — the template sheet is missing columns${detail}`
              : reason.startsWith("WORKBOOK_")
                ? `Session not started — its attendance sheet could not be created (${reason})${detail}`
                : `Session start rejected: ${reason}${detail}`,
          "error",
        );
        setStartDisabled(false);
        setStarting(false);
        return;
      }

      setLecture(data.lecture || lecture.trim() || "Lecture");
      setRunning(true);
      setStarting(false);
      setStopDisabled(false);
      setLectureDisabled(true);
      setSheetDownload({ state: "idle", message: "" });
      applySheet(data);
      setStatus(
        data.attendanceSheet
          ? "Session started — a fresh attendance sheet was created for it"
          : "Session started — reference: the confirmed lecture hall",
        "running",
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
    lectureLocation,
    fetchQR,
    applySheet,
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
      const data = await apiPost("dqr-stop", { key });
      // Stop answers with the session's workbook so the professor can open and
      // download it right away.
      applySheet(data);
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
  }, [key, fetchQR, applyActive, applySheet, hideQR, setRunning, setStatus]);

  // ---- Download the session workbook as .xlsx ----
  // Primary route: the workflow streams the file with its own Google
  // credential, so it works no matter which Google account is signed in here.
  // Fallback: Google's own export URL, which uses the browser's session.
  const downloadSessionSheet = useCallback(async () => {
    const sheet = attendanceSheet;
    if (!key || !sheet) return;

    setSheetDownload({ state: "busy", message: "Preparing the .xlsx…" });

    try {
      const res = await fetch(
        sessionSheetExportEndpoint(N8N, { key, sessionId: sheet.sessionId }),
      );
      const contentType = res.headers.get("content-type") || "";
      if (!isSpreadsheetResponse(res.status, contentType)) {
        throw new ApiRequestError(`Export failed (${res.status})`, res.status);
      }
      const blob = await res.blob();
      if (!triggerDownload(blob, sessionSheetFileName(sheet))) {
        throw new ApiRequestError("The browser blocked the download", 0);
      }
      setSheetDownload({ state: "saved", message: `${sessionSheetFileName(sheet)} saved` });
    } catch {
      if (!sheet.xlsxUrl) {
        setSheetDownload({
          state: "error",
          message: "Download failed — open the sheet and use File ▸ Download ▸ Microsoft Excel.",
        });
        return;
      }
      window.open(sheet.xlsxUrl, "_blank", "noopener,noreferrer");
      setSheetDownload({
        state: "fallback",
        message: "The workflow could not stream the file — opened Google's Excel export instead.",
      });
    }
  }, [attendanceSheet, key]);

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
    lectureLocation,
    lectureLocationStatus,
    lectureLocationNotice,
    confirmLectureLocation,
    clearLectureLocation,
    attendanceRadiusMeters,
    locationStats,
    attendanceSheet,
    sheetDownload,
    downloadSessionSheet,
    startSession,
    stopSession,
  };
}

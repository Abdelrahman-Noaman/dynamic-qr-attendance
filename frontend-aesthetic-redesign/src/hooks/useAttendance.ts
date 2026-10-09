import { useCallback, useEffect, useRef, useState } from "react";
import { N8N, STUDENT_URL } from "../config";

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
}

interface ApiResponse {
  ok?: boolean;
  error?: string;
  active?: boolean;
  lecture?: string;
  sessionId?: string;
  token?: string;
  expiresInMs?: number;
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
    });
  }, []);

  // Active session → show QR, lock controls, and schedule the next token fetch
  const applyActive = useCallback(
    (data: ApiResponse) => {
      missRef.current = 0;
      setRunning(true);
      setStartDisabled(true);
      setStopDisabled(false);
      setLectureDisabled(true);
      setLecture(data.lecture || "Lecture");

      showQR(data);
      setStatus(`Running — ${data.lecture || "Lecture"}`, "running");

      // Schedule next fetch at expiresInMs + 200ms
      const delay = (data.expiresInMs || 10000) + 200;
      clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => fetchQRRef.current(), delay);
    },
    [setRunning, setStatus, showQR]
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
        setStatus(
          data.error === "unauthorized" ? "Wrong key" : data.error || "Unknown error",
          "error"
        );
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

  // ---- Start ----
  const startSession = useCallback(async () => {
    if (!key) return;
    setStartDisabled(true);
    setStarting(true);
    setStatus("Starting…", "running");

    try {
      const data = await apiPost("dqr-start", {
        key,
        lecture: lecture.trim() || "Lecture",
      });

      if (!data.ok) {
        setStatus(data.error === "unauthorized" ? "Wrong key" : String(data.error), "error");
        setStartDisabled(false);
        setStarting(false);
        return;
      }

      setRunning(true);
      setStarting(false);
      setStopDisabled(false);
      setLectureDisabled(true);
      fetchQR();
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
  }, [key, lecture, fetchQR, setRunning, setStatus]);

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
    startSession,
    stopSession,
  };
}

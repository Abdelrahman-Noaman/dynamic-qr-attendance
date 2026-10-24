// ============================================================
// n8n webhook client.
//
// Data access lives here so components never build URLs or parse
// responses. The contract (endpoints, form-encoded bodies, JSON with
// `ok`/`error`) is the same one the original dashboard used.
// ============================================================
import { N8N } from "../config";

export const ENDPOINTS = {
  qr: "dqr-qr",
  start: "dqr-start",
  stop: "dqr-stop",
} as const;

/** Requests that hang would leave the dashboard looking live but frozen. */
const REQUEST_TIMEOUT_MS = 12_000;

export interface LocationCounters {
  verified: number;
  outsideRadius: number;
  rejected: number;
}

/** The reference point the workflow is using for the live session. */
export interface SessionReference {
  latitude: number;
  longitude: number;
  source?: string;
  confirmedAt?: number;
}

export interface SessionResponse {
  ok?: boolean;
  error?: string;
  active?: boolean;
  lecture?: string;
  sessionId?: string;
  token?: string;
  expiresInMs?: number;
  attendanceRadiusMeters?: number;
  locationStats?: Partial<LocationCounters>;
  lectureLocation?: SessionReference | null;
}

/** Server-side rejection codes this client knows how to explain. */
export type StartErrorCode =
  | "unauthorized"
  | "LECTURE_LOCATION_MISSING"
  | "LECTURE_LOCATION_INVALID"
  | "LECTURE_LOCATION_STALE"
  | "INVALID_LOCATION"
  | "LOCATION_UNAVAILABLE"
  | "UNKNOWN_START_ERROR"
  | (string & {});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "http" | "network" | "timeout" | "payload",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Turn a transport failure into a message a professor can act on. The
 * distinction matters: a timeout is retried, a 401 is not.
 */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Unexpected error talking to the attendance service.";
}

async function readJson(response: Response): Promise<SessionResponse> {
  const text = await response.text();
  let data: SessionResponse | null = null;
  try {
    data = text ? (JSON.parse(text) as SessionResponse) : null;
  } catch {
    // Non-JSON body: the HTTP status below is the useful diagnostic.
  }

  if (!response.ok) {
    const detail = data?.error || response.statusText || "no detail";
    throw new ApiError(`Attendance service responded ${response.status} (${detail}).`, "http", response.status);
  }
  if (!data) {
    throw new ApiError("Attendance service returned an empty response.", "payload", response.status);
  }
  return data;
}

async function request(path: string, init: RequestInit): Promise<SessionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${N8N}/${path}`, { ...init, signal: controller.signal });
    return await readJson(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError("The attendance service did not answer within 12 seconds.", "timeout");
    }
    throw new ApiError("Could not reach the attendance service. Check your connection.", "network");
  } finally {
    clearTimeout(timer);
  }
}

function get(path: string, params: Record<string, string>): Promise<SessionResponse> {
  return request(`${path}?${new URLSearchParams(params)}`, { method: "GET", cache: "no-store" });
}

function post(path: string, body: Record<string, string>): Promise<SessionResponse> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

/** Current token, or the idle state of the workflow. */
export function fetchSession(key: string): Promise<SessionResponse> {
  return get(ENDPOINTS.qr, { key });
}

export interface StartSessionInput {
  key: string;
  lecture: string;
  latitude: number;
  longitude: number;
  confirmedAt: number;
}

export function startSession(input: StartSessionInput): Promise<SessionResponse> {
  return post(ENDPOINTS.start, {
    key: input.key,
    lecture: input.lecture,
    instructorLatitude: String(input.latitude),
    instructorLongitude: String(input.longitude),
    instructorLocationSource: "map",
    instructorLocationConfirmedAt: String(input.confirmedAt),
  });
}

export function stopSession(key: string): Promise<SessionResponse> {
  return post(ENDPOINTS.stop, { key });
}

export type KeyCheck = { ok: true } | { ok: false; reason: "unauthorized" | "unreachable"; detail: string };

/**
 * Probe the key before the dashboard starts polling. A wrong key is a
 * different situation from an unreachable server, and the gate says so.
 */
export async function checkKey(key: string): Promise<KeyCheck> {
  try {
    const data = await fetchSession(key);
    if (data.ok === false && data.error === "unauthorized") {
      return { ok: false, reason: "unauthorized", detail: "That key was rejected by the attendance service." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "unreachable", detail: describeApiError(error) };
  }
}

/** Coerce whatever the workflow sent into counters the UI can trust. */
export function normaliseCounters(value: unknown): LocationCounters {
  const raw = (value ?? {}) as Partial<Record<keyof LocationCounters, unknown>>;
  const count = (input: unknown) => (typeof input === "number" && Number.isFinite(input) && input > 0 ? Math.floor(input) : 0);
  return {
    verified: count(raw.verified),
    outsideRadius: count(raw.outsideRadius),
    rejected: count(raw.rejected),
  };
}

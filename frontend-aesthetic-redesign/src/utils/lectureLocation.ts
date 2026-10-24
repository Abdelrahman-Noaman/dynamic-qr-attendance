// ============================================================
// Lecture-hall reference location.
//
// The professor's laptop may report ±150 m or worse, which can never satisfy a
// 50 m accuracy target. So the reference point for a session is a map pin that
// the professor confirms for the lecture hall. It is an administrative
// reference: it says where the class is, not that the professor is standing
// there. Student readings are still real browser geolocation and are still
// held to the 50 m accuracy target and the 100 m radius.
//
// The validation rules themselves live in frontend/location-core.js so the
// student page, the dashboard and the tests share one implementation.
// ============================================================
import {
  isValidCoordinatePair,
  LECTURE_LOCATION,
  LOCATION_QUALITY,
  LOCATION_REASONS,
  validateLectureLocation,
} from "../../../frontend/location-core.js";
import { GEOCODE_URL, REVERSE_GEOCODE_URL } from "../config";

export { LECTURE_LOCATION, LOCATION_QUALITY, LOCATION_REASONS, validateLectureLocation };

export const LECTURE_LOCATION_SOURCE = "map" as const;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LectureLocation extends Coordinates {
  /** Epoch ms when the professor pressed "Confirm Lecture Location". */
  confirmedAt: number;
  /** Where the pin came from. The session reference is always `map`. */
  source: typeof LECTURE_LOCATION_SOURCE;
  /** Optional human label from geocoding, for display/audit only. */
  label?: string;
}

export interface PlaceResult extends Coordinates {
  label: string;
}

const STORAGE_KEY = "dqr_lecture_location_v1";

export function coordinatesEqual(
  a: Coordinates | null | undefined,
  b: Coordinates | null | undefined,
  tolerance = 1e-7,
): boolean {
  if (!a || !b) return false;
  return Math.abs(a.latitude - b.latitude) <= tolerance && Math.abs(a.longitude - b.longitude) <= tolerance;
}

/** Six decimals ≈ 11 cm, enough to describe a lecture hall without false precision. */
export function formatCoordinates(location: Coordinates | null | undefined): string {
  if (!location || !isValidCoordinatePair(location.latitude, location.longitude)) return "not selected";
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

export function createLectureLocation(
  coordinates: Coordinates,
  options: { confirmedAt?: number; label?: string } = {},
): LectureLocation {
  if (!isValidCoordinatePair(coordinates.latitude, coordinates.longitude)) {
    throw new Error(
      `Cannot confirm lecture location: ${coordinates.latitude}, ${coordinates.longitude} is outside the valid ranges.`,
    );
  }
  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    confirmedAt: options.confirmedAt ?? Date.now(),
    source: LECTURE_LOCATION_SOURCE,
    ...(options.label ? { label: options.label } : {}),
  };
}

/** True when the confirmed hall is still within the confirmation window. */
export function isLectureLocationFresh(location: LectureLocation | null, now = Date.now()): boolean {
  return validateLectureLocation(location, { now }).valid;
}

export function lectureLocationAgeMs(location: LectureLocation | null, now = Date.now()): number | null {
  if (!location || !Number.isFinite(location.confirmedAt)) return null;
  return Math.max(0, now - location.confirmedAt);
}

// ---- Persistence: remember the last hall this professor confirmed ----
// Only a location the professor confirmed is ever stored; there is no built-in
// default, so the application never invents a lecture hall.
export function saveLectureLocation(location: LectureLocation | null): void {
  try {
    if (!location) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        latitude: location.latitude,
        longitude: location.longitude,
        confirmedAt: location.confirmedAt,
        label: location.label ?? "",
      }),
    );
  } catch {
    // Private mode / storage disabled: the in-memory selection still works.
  }
}

export function loadLectureLocation(): LectureLocation | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LectureLocation>;
    if (!isValidCoordinatePair(parsed.latitude, parsed.longitude)) return null;
    if (!Number.isFinite(parsed.confirmedAt)) return null;
    return createLectureLocation(
      { latitude: Number(parsed.latitude), longitude: Number(parsed.longitude) },
      { confirmedAt: Number(parsed.confirmedAt), label: parsed.label || undefined },
    );
  } catch {
    return null;
  }
}

// ---- Geocoding (Nominatim; no API key) ----
interface NominatimPlace {
  display_name?: string;
  lat?: string;
  lon?: string;
}

export interface SearchOptions {
  signal?: AbortSignal;
  limit?: number;
  language?: string;
}

/**
 * Free-text place search. Returns [] on any failure so the picker can show a
 * friendly "no results" state instead of breaking.
 */
export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(options.limit ?? 5));
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("q", trimmed);

  try {
    const response = await fetch(url, {
      signal: options.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": options.language ?? "en",
      },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as NominatimPlace[];
    if (!Array.isArray(data)) return [];
    return data
      .map((place) => ({
        label: String(place.display_name ?? "").trim(),
        latitude: Number(place.lat),
        longitude: Number(place.lon),
      }))
      .filter((place) => place.label.length > 0 && isValidCoordinatePair(place.latitude, place.longitude))
      .slice(0, options.limit ?? 5);
  } catch {
    return [];
  }
}

/** Best-effort human label for a pin. Returns null when unavailable. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  options: { signal?: AbortSignal; language?: string } = {},
): Promise<string | null> {
  if (!isValidCoordinatePair(latitude, longitude)) return null;

  const url = new URL(REVERSE_GEOCODE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));

  try {
    const response = await fetch(url, {
      signal: options.signal,
      headers: { Accept: "application/json", "Accept-Language": options.language ?? "en" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as NominatimPlace;
    return typeof data.display_name === "string" && data.display_name ? data.display_name : null;
  } catch {
    return null;
  }
}

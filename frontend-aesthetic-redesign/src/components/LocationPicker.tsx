import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  AttributionControl,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  GEOCODE_URL,
  MAP_PLACE_ZOOM,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
  MAP_WORLD_VIEW,
} from "../config";
import { cn } from "../utils/cn";
import {
  coordinatesEqual,
  createLectureLocation,
  formatCoordinates,
  isLectureLocationFresh,
  reverseGeocode,
  searchPlaces,
  type LectureLocation,
  type PlaceResult,
} from "../utils/lectureLocation";
import { acquireLocation } from "../../../frontend/location-core.js";

const SEARCH_DEBOUNCE_MS = 450;

/** Round CSS pin so the single-file build never needs Leaflet's default images. */
const pinIcon = L.divIcon({
  className: "dqr-pin-wrap",
  html: '<span class="dqr-pin"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const hallIcon = L.divIcon({
  className: "dqr-pin-wrap",
  html: '<span class="dqr-pin dqr-pin-hall"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

interface Props {
  /** The location currently confirmed for the session, if any. */
  value: LectureLocation | null;
  onConfirm: (location: LectureLocation) => void;
  onClear: () => void;
  /** Locked while a session is live. */
  disabled?: boolean;
  radiusMeters: number;
  maxAccuracyMeters: number;
}

function ClickToPlace({ onPick, enabled }: { onPick: (lat: number, lng: number) => void; enabled: boolean }) {
  useMapEvents({
    click(event) {
      if (enabled) onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function Recenter({ target, zoom }: { target: { latitude: number; longitude: number } | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.latitude, target.longitude], zoom, { duration: 0.6 });
  }, [map, target?.latitude, target?.longitude, zoom, target]);
  return null;
}

/** Leaflet measures its container on mount; the card animates, so re-measure. */
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => map.invalidateSize();
    invalidate();
    const timers = [80, 300, 800].map((delay) => window.setTimeout(invalidate, delay));
    window.addEventListener("resize", invalidate);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", invalidate);
    };
  }, [map]);
  return null;
}

export function LocationPicker({
  value,
  onConfirm,
  onClear,
  disabled = false,
  radiusMeters,
  maxAccuracyMeters,
}: Props) {
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(
    value ? { latitude: value.latitude, longitude: value.longitude } : null,
  );
  const [label, setLabel] = useState<string | null>(value?.label ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [focus, setFocus] = useState<{ latitude: number; longitude: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the pin in sync when a stored/confirmed location arrives.
  useEffect(() => {
    if (!value) return;
    setPin({ latitude: value.latitude, longitude: value.longitude });
    setLabel(value.label ?? null);
  }, [value?.latitude, value?.longitude, value?.confirmedAt]);

  // ---- Place search (debounced, aborts the previous request) ----
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setSearching(false);
      setSearchNote(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setSearching(true);

    const timer = window.setTimeout(async () => {
      const found = await searchPlaces(trimmed, { signal: controller.signal, limit: 5 });
      if (controller.signal.aborted) return;
      setResults(found);
      setSearching(false);
      setSearchNote(
        found.length === 0
          ? `No match for “${trimmed}”. Try a building name, street, or university.`
          : null,
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choosePlace = useCallback((place: PlaceResult) => {
    setPin({ latitude: place.latitude, longitude: place.longitude });
    setLabel(place.label);
    setFocus({ latitude: place.latitude, longitude: place.longitude });
    setQuery("");
    setResults([]);
    setSearchNote(null);
  }, []);

  const pick = useCallback((latitude: number, longitude: number) => {
    if (disabled) return;
    setPin({ latitude, longitude });
    setLabel(null);
    setFocus({ latitude, longitude });
  }, [disabled]);

  const movePin = useCallback((latitude: number, longitude: number) => {
    setPin({ latitude, longitude });
    setLabel(null);
  }, []);

  // ---- Optional aid: centre the map on the device, without trusting it ----
  const centreOnDevice = useCallback(async () => {
    if (!navigator.geolocation) {
      setDeviceNote("This browser has no geolocation service.");
      return;
    }
    setDeviceBusy(true);
    setDeviceNote("Reading the device position…");
    try {
      const acquired = await acquireLocation(navigator.geolocation, {
        allowPoorAccuracy: true,
        maxAttempts: 2,
      });
      const { latitude, longitude, accuracy } = acquired.reading;
      setFocus({ latitude, longitude });
      setDeviceNote(
        acquired.precisionMet
          ? `Device reported ±${Math.round(accuracy)} m. You can place the pin there, but check it against the hall — a device fix is not proof of the room either.`
          : `Device reported ±${Math.round(accuracy)} m, far too coarse for a ${maxAccuracyMeters} m target. Centre the map is all this gives you: place the pin on the lecture hall by hand.`,
      );
      if (acquired.precisionMet) {
        setPin({ latitude, longitude });
        setLabel(null);
      }
    } catch (error) {
      const reason = (error as { reason?: string }).reason ?? "LOCATION_UNAVAILABLE";
      setDeviceNote(`Device position unavailable (${reason}). Search for the hall or place the pin by hand.`);
    } finally {
      setDeviceBusy(false);
    }
  }, [maxAccuracyMeters]);

  const dirty = useMemo(() => {
    if (!pin) return false;
    if (!value) return true;
    return !coordinatesEqual(pin, value);
  }, [pin, value]);

  const fresh = value ? isLectureLocationFresh(value) : false;
  const confirmed = Boolean(value) && fresh && !dirty;

  const confirm = useCallback(() => {
    if (!pin) return;
    const next = createLectureLocation(pin, { label: label ?? undefined });
    onConfirm(next);

    // Best-effort place name for the audit trail; never blocks confirmation.
    if (!label) {
      void reverseGeocode(pin.latitude, pin.longitude).then((resolved) => {
        if (resolved) onConfirm({ ...next, label: resolved });
      });
    }
  }, [pin, label, onConfirm]);

  const statusTone = confirmed ? "confirmed" : value ? "pending" : "empty";

  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-pink uppercase">
            Lecture hall location
          </p>
          <p className="mt-1.5 max-w-[34rem] text-sm text-cream/75">
            The reference point for this session. Search for the hall or drag the pin to the room — the
            laptop&apos;s own GPS is not used for this.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] font-bold tracking-[0.16em] uppercase",
            statusTone === "confirmed" && "border-lime/60 bg-lime/10 text-lime",
            statusTone === "pending" && "border-amber/60 bg-amber/10 text-amber",
            statusTone === "empty" && "border-white/25 bg-white/5 text-cream/60",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              statusTone === "confirmed" && "bg-lime",
              statusTone === "pending" && "bg-amber",
              statusTone === "empty" && "bg-cream/40",
            )}
          />
          {confirmed ? "Location confirmed" : value ? "Not confirmed" : "Not set"}
        </span>
      </div>

      {/* ---- Search ---- */}
      <div className="relative mt-4">
        <label htmlFor="hall-search" className="sr-only">
          Search for the lecture hall
        </label>
        <input
          id="hall-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Enter must not submit the surrounding session form; it picks the
          // first search hit instead.
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            if (results[0]) choosePlace(results[0]);
          }}
          disabled={disabled}
          autoComplete="off"
          placeholder="Search a building, campus, or address…"
          className="w-full rounded-xl border border-white/20 bg-ink/70 px-3 py-2.5 font-mono text-sm text-cream outline-none transition-colors placeholder:text-cream/35 focus:border-lime disabled:opacity-60"
        />
        {searching && (
          <span className="absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] tracking-[0.18em] text-cream/50 uppercase">
            searching…
          </span>
        )}

        {results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-[1200] mt-1 max-h-56 overflow-auto rounded-xl border border-white/20 bg-ink-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)]">
            {results.map((place) => (
              <li key={`${place.latitude},${place.longitude},${place.label}`}>
                <button
                  type="button"
                  onClick={() => choosePlace(place)}
                  className="block w-full border-b border-white/10 px-3 py-2.5 text-left text-xs leading-relaxed text-cream/80 last:border-0 hover:bg-lime/15 hover:text-cream"
                >
                  {place.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {searchNote && <p className="mt-2 font-mono text-[11px] text-amber/90">{searchNote}</p>}

      {/* ---- Map ---- */}
      <div
        className="dqr-map relative mt-3 h-[300px] overflow-hidden rounded-xl border border-white/20"
        role="region"
        aria-label="Map used to place the lecture hall pin"
      >
        <MapContainer
          center={
            pin
              ? [pin.latitude, pin.longitude]
              : [MAP_WORLD_VIEW.latitude, MAP_WORLD_VIEW.longitude]
          }
          zoom={pin ? MAP_PLACE_ZOOM : MAP_WORLD_VIEW.zoom}
          scrollWheelZoom
          attributionControl={false}
          className="h-full w-full"
        >
          <AttributionControl
            prefix='<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>'
          />
          <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} />
          <ClickToPlace onPick={pick} enabled={!disabled} />
          <Recenter target={focus} zoom={MAP_PLACE_ZOOM} />
          <ResizeFix />
          {pin && (
            <Marker
              position={[pin.latitude, pin.longitude]}
              icon={confirmed ? hallIcon : pinIcon}
              draggable={!disabled}
              eventHandlers={{
                dragend: (event) => {
                  const { lat, lng } = (event.target as L.Marker).getLatLng();
                  movePin(lat, lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-mono text-xs text-cream/80">
          Selected: <span className="text-lime">{formatCoordinates(pin)}</span>
        </p>
        {pin && (
          <p className="font-mono text-[10px] tracking-[0.14em] text-cream/45 uppercase">
            {dirty ? "unconfirmed changes" : "pin matches confirmed location"}
          </p>
        )}
        <button
          type="button"
          onClick={centreOnDevice}
          disabled={deviceBusy || disabled}
          className="rounded-full border border-white/25 px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.14em] text-cream/70 uppercase transition-colors hover:border-lime/60 hover:text-lime disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deviceBusy ? "Locating…" : "Centre on my device"}
        </button>
      </div>
      {deviceNote && <p className="mt-2 font-mono text-[11px] leading-relaxed text-cream/60">{deviceNote}</p>}

      {/* ---- Confirm ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={confirm}
          disabled={!pin || disabled || (confirmed && !dirty)}
          className={cn(
            "rounded-full px-5 py-2.5 font-display text-sm font-extrabold tracking-wide uppercase transition-colors",
            "bg-lime text-ink hover:bg-cream",
            "disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-cream/45",
          )}
        >
          {value && dirty ? "Update lecture location" : "Confirm Lecture Location"}
        </button>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onClear();
              setPin(null);
              setLabel(null);
            }}
            className="rounded-full border border-white/20 px-4 py-2 font-mono text-[10px] font-bold tracking-[0.14em] text-cream/60 uppercase hover:border-pink/60 hover:text-pink"
          >
            Clear
          </button>
        )}
      </div>

      {value && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-cream/60">
          <dt className="tracking-[0.14em] uppercase">Latitude</dt>
          <dd className="text-right text-cream/85">{value.latitude.toFixed(6)}</dd>
          <dt className="tracking-[0.14em] uppercase">Longitude</dt>
          <dd className="text-right text-cream/85">{value.longitude.toFixed(6)}</dd>
          <dt className="tracking-[0.14em] uppercase">Confirmed</dt>
          <dd className="text-right text-cream/85">
            {new Date(value.confirmedAt).toLocaleTimeString()}
            {fresh ? "" : " · stale"}
          </dd>
          {value.label && (
            <>
              <dt className="tracking-[0.14em] uppercase">Place</dt>
              <dd className="col-span-1 text-right text-cream/85">{value.label}</dd>
            </>
          )}
        </dl>
      )}

      <p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-cream/55">
        <strong className="font-mono tracking-[0.12em] text-cream/75 uppercase">Note:</strong> this pin is
        the lecture hall — an administrative reference for where the class meets. It is not verified live
        proof that the professor is physically present, and it is not the professor&apos;s device position.
        Students are still checked with their own live GPS: accuracy must be ≤{maxAccuracyMeters} m and the
        distance to this pin ≤{radiusMeters} m.
        {GEOCODE_URL.includes("nominatim.openstreetmap.org") && (
          <> Place search uses OpenStreetMap Nominatim; tiles and search are attributed on the map.</>
        )}
      </p>
    </div>
  );
}

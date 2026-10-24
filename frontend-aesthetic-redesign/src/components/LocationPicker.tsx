import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { acquireLocation } from "../../../frontend/location-core.js";
import {
  GEOCODE_URL,
  MAP_PLACE_ZOOM,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
  MAP_WORLD_VIEW,
} from "../config";
import {
  coordinatesEqual,
  createLectureLocation,
  formatCoordinates,
  isLectureLocationFresh,
  reverseGeocode,
  type LectureLocation,
  type PlaceResult,
} from "../utils/lectureLocation";
import { formatAge } from "../utils/format";
import { HallSearch } from "./HallSearch";
import { Button } from "./ui/Button";
import { DataList } from "./ui/Field";

interface Props {
  value: LectureLocation | null;
  onConfirm: (location: LectureLocation) => void;
  onClear: () => void;
  radiusMeters: number;
  maxAccuracyMeters: number;
}

/** CSS round pin so the single-file build never needs Leaflet's marker images. */
const pinIcon = (confirmed: boolean) =>
  L.divIcon({
    className: "map-pin-wrap",
    html: `<span class="map-pin" data-confirmed="${confirmed}"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

const draftIcon = pinIcon(false);
const confirmedIcon = pinIcon(true);

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function Recenter({ target }: { target: { latitude: number; longitude: number } | null }) {
  const map = useMap();
  const lat = target?.latitude;
  const lon = target?.longitude;
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    map.flyTo([lat, lon], MAP_PLACE_ZOOM, { duration: 0.6 });
  }, [map, lat, lon]);
  return null;
}

/** Leaflet measures its container on mount; this panel can animate open. */
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

/**
 * Pick the lecture hall on a map. Two paths: search for a place (keyboard
 * friendly) or click/drag the pin (pointer). The device position is offered
 * only as a hint for centring the map — it is never trusted as the reference.
 */
export function LocationPicker({ value, onConfirm, onClear, radiusMeters, maxAccuracyMeters }: Props) {
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(
    value ? { latitude: value.latitude, longitude: value.longitude } : null,
  );
  const [label, setLabel] = useState<string | null>(value?.label ?? null);
  const [focus, setFocus] = useState<{ latitude: number; longitude: number } | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const reverseAbort = useRef<AbortController | null>(null);

  // Adopt a stored/confirmed hall that arrives after mount.
  useEffect(() => {
    if (!value) return;
    setPin({ latitude: value.latitude, longitude: value.longitude });
    setLabel(value.label ?? null);
  }, [value?.latitude, value?.longitude, value?.confirmedAt]);

  useEffect(() => () => reverseAbort.current?.abort(), []);

  const choosePlace = useCallback((place: PlaceResult) => {
    setPin({ latitude: place.latitude, longitude: place.longitude });
    setLabel(place.label);
    setFocus({ latitude: place.latitude, longitude: place.longitude });
    setSavedNote(null);
  }, []);

  const pick = useCallback((latitude: number, longitude: number) => {
    setPin({ latitude, longitude });
    setLabel(null);
    setFocus({ latitude, longitude });
    setSavedNote(null);
  }, []);

  const centreOnDevice = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setDeviceNote("This browser has no geolocation service.");
      return;
    }
    setDeviceBusy(true);
    setDeviceNote("Reading the device position…");
    try {
      const acquired = await acquireLocation(navigator.geolocation, { allowPoorAccuracy: true, maxAttempts: 2 });
      const { latitude, longitude, accuracy } = acquired.reading;
      setFocus({ latitude, longitude });
      setDeviceNote(
        acquired.precisionMet
          ? `Device reported ±${Math.round(accuracy)} m and the map moved there. Check the pin against the room before confirming — a device fix is not proof of the hall.`
          : `Device reported ±${Math.round(accuracy)} m, far coarser than the ${maxAccuracyMeters} m student target. The map moved there; place the pin on the hall by hand.`,
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
  const alreadyConfirmed = Boolean(value) && fresh && !dirty;

  const confirm = useCallback(() => {
    if (!pin) return;
    const next = createLectureLocation(pin, { label: label ?? undefined });
    onConfirm(next);
    setSavedNote("Pin confirmed. Students are verified against this point.");

    // Best-effort place name for the audit trail; never blocks confirmation.
    if (!label) {
      reverseAbort.current?.abort();
      const controller = new AbortController();
      reverseAbort.current = controller;
      void reverseGeocode(pin.latitude, pin.longitude, { signal: controller.signal }).then((resolved) => {
        if (resolved && !controller.signal.aborted) onConfirm({ ...next, label: resolved });
      });
    }
  }, [label, onConfirm, pin]);

  return (
    <div className="rounded-lg border border-line bg-white/[0.02] p-3 sm:p-4">
      <HallSearch onPick={choosePlace} />

      <div className="mt-3">
        <div
          className="map-shell h-[280px] overflow-hidden rounded-lg border border-line"
          role="region"
          aria-label="Map for placing the lecture hall pin"
          aria-describedby="map-hint"
        >
          <MapContainer
            center={pin ? [pin.latitude, pin.longitude] : [MAP_WORLD_VIEW.latitude, MAP_WORLD_VIEW.longitude]}
            zoom={pin ? MAP_PLACE_ZOOM : MAP_WORLD_VIEW.zoom}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} />
            <ClickToPlace onPick={pick} />
            <Recenter target={focus} />
            <ResizeFix />
            {pin && (
              <Marker
                position={[pin.latitude, pin.longitude]}
                icon={alreadyConfirmed ? confirmedIcon : draftIcon}
                draggable
                eventHandlers={{
                  dragend: (event) => {
                    const { lat, lng } = (event.target as L.Marker).getLatLng();
                    pick(lat, lng);
                  },
                }}
              />
            )}
          </MapContainer>
        </div>
        <p id="map-hint" className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
          Click the map or drag the pin. Placing a pin needs a pointer; search works from the keyboard.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <p className="tabular font-mono text-[12px] text-fg">
          {pin ? (
            <>
              <span className="label-micro mr-2 text-fg-subtle">Pin</span>
              {formatCoordinates(pin)}
            </>
          ) : (
            <span className="text-fg-muted">No pin placed yet.</span>
          )}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={centreOnDevice} busy={deviceBusy}>
            {deviceBusy ? "Locating…" : "Centre on device"}
          </Button>
          <Button size="sm" variant="primary" onClick={confirm} disabled={!pin || (alreadyConfirmed && !dirty)}>
            {value && dirty ? "Update pin" : "Confirm hall"}
          </Button>
          {value && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onClear();
                setPin(null);
                setLabel(null);
                setFocus(null);
                setSavedNote(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {pin && value && dirty && (
        <p className="mt-2 text-[12px] text-amber">Unconfirmed change — confirm the pin to use it.</p>
      )}
      {savedNote && <p className="mt-2 text-[12px] text-lime">{savedNote}</p>}
      {deviceNote && <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{deviceNote}</p>}

      {value && (
        <div className="mt-3">
          <DataList
            rows={[
              { label: "Confirmed pin", value: formatCoordinates(value), mono: true },
              {
                label: "Confirmed at",
                value: `${new Date(value.confirmedAt).toLocaleTimeString()} · ${formatAge(value.confirmedAt)}`,
                mono: true,
              },
              { label: "Status", value: fresh ? "valid for a new session" : "stale — confirm again" },
            ]}
          />
        </div>
      )}

      <details className="mt-3 border-t border-line pt-3">
        <summary className="cursor-pointer text-[12px] text-fg-muted hover:text-fg">
          How a location is verified
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
          This pin is the lecture hall, not the professor&apos;s device position: a laptop indoors typically
          reports ±150 m, which would fail the {maxAccuracyMeters} m gate. Students are checked with their own
          live GPS against this pin: accuracy must be ≤{maxAccuracyMeters} m and distance ≤{radiusMeters} m, or the
          submission is rejected on the spot.{" "}
          {GEOCODE_URL.includes("nominatim.openstreetmap.org") &&
            "Place search uses OpenStreetMap Nominatim; tiles and search are attributed on the map."}
        </p>
      </details>
    </div>
  );
}

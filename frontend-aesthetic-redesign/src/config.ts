// ============================================================
// ★ CONFIGURE THESE TWO CONSTANTS ★
// ============================================================
// Your n8n production webhook base URL (no trailing slash)
export const N8N = "https://no3man.app.n8n.cloud/webhook";

// Where student-attendance.html is hosted
export const STUDENT_URL =
  "https://abdelrahman-noaman.github.io/dynamic-qr-attendance/frontend/student-attendance.html";

// ============================================================
// Map + geocoding (optional overrides, no API keys required)
// ============================================================
// Tiles: any XYZ raster tile server works. The default is CARTO's dark basemap
// so the map matches the dashboard. OpenStreetMap's own tiles also work:
//   VITE_MAP_TILE_URL="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
// Respect the tile provider's usage policy and keep the attribution visible.
export const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ?? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export const MAP_TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Geocoding: Nominatim (OpenStreetMap) needs no API key. Point this at your own
// Nominatim/Photon instance if you expect heavy use, and respect the 1 req/s
// policy of the public endpoint (the picker debounces searches).
export const GEOCODE_URL = import.meta.env.VITE_GEOCODE_URL ?? "https://nominatim.openstreetmap.org/search";
export const REVERSE_GEOCODE_URL =
  import.meta.env.VITE_REVERSE_GEOCODE_URL ?? "https://nominatim.openstreetmap.org/reverse";

// Zoom used when the picker centres on a search result or a chosen pin.
export const MAP_PLACE_ZOOM: number = 17;
// Neutral world viewport used only when nothing is selected yet. This is not a
// lecture location: a session can only start from a location the professor confirms.
export const MAP_WORLD_VIEW: { latitude: number; longitude: number; zoom: number } = {
  latitude: 20,
  longitude: 0,
  zoom: 2,
};

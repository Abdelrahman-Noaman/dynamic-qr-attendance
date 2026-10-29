// ============================================================
// Session attendance workbook.
//
// Every attendance session gets its own Google Sheet: the workflow creates one
// when the professor presses Start (same Attendance columns every time) and
// returns the same `attendanceSheet` shape from /dqr-start, /dqr-qr and
// /dqr-stop. These helpers normalise that payload and build the two download
// routes:
//
//   1. the workflow's /dqr-export endpoint, which streams the .xlsx using n8n's
//      own Google credential, so the download does not depend on which Google
//      account the professor happens to be signed in with;
//   2. the Google Sheets export URL, used as a fallback with the browser's own
//      Google session.
//
// Kept as plain ESM so the dashboard and the Node tests share one
// implementation, exactly like location-core.js.
// ============================================================

/** Characters a download file name must not contain. */
const ILLEGAL_FILE_NAME = /[/\\:*?"<>|]/g;

/**
 * @typedef {object} SessionSheetLike
 * @property {string} [sessionId]
 * @property {string} [tab]
 * @property {string} [title]
 * @property {string} [url]
 * @property {string} [xlsxUrl]
 */

/**
 * @typedef {object} SessionSheet
 * @property {string} sessionId
 * @property {string} tab
 * @property {string} title
 * @property {string} url
 * @property {string} xlsxUrl
 */

/**
 * Normalises an `attendanceSheet` payload from the workflow.
 * Returns null when the response carries no usable sheet.
 * @param {SessionSheetLike | null | undefined} payload
 * @returns {SessionSheet | null}
 */
export function readSessionSheet(payload) {
  if (!payload || typeof payload !== "object") return null;
  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (!url) return null;

  return {
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : "",
    tab: typeof payload.tab === "string" && payload.tab.trim() ? payload.tab.trim() : "Attendance",
    title: typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Attendance",
    url,
    xlsxUrl:
      typeof payload.xlsxUrl === "string" && payload.xlsxUrl.trim()
        ? payload.xlsxUrl.trim()
        : googleSheetExportUrl({ url }),
  };
}

/**
 * Google's own Excel export link, derived from the sheet URL when needed.
 * @param {SessionSheetLike | null | undefined} sheet
 * @returns {string}
 */
export function googleSheetExportUrl(sheet) {
  const source = sheet && typeof sheet === "object" ? sheet.xlsxUrl || sheet.url || "" : "";
  const id = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(source);
  if (!id) return "";
  return `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=xlsx`;
}

/**
 * `<workbook title>.xlsx`, with the characters file systems reject removed.
 * @param {SessionSheetLike | null | undefined} sheet
 * @returns {string}
 */
export function sessionSheetFileName(sheet) {
  const fallback = sheet && sheet.sessionId ? `Attendance-${sheet.sessionId}` : "Attendance";
  const base = String((sheet && sheet.title) || fallback)
    .replace(ILLEGAL_FILE_NAME, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${base || fallback}.xlsx`;
}

/**
 * The workflow endpoint that streams the workbook as .xlsx.
 * @param {string} baseUrl n8n production webhook base URL
 * @param {{ key?: string, sessionId?: string }} [options]
 * @returns {string}
 */
export function sessionSheetExportEndpoint(baseUrl, { key, sessionId } = {}) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const params = new URLSearchParams({ key: String(key || "") });
  if (sessionId) params.set("s", String(sessionId));
  return `${base}/dqr-export?${params.toString()}`;
}

/**
 * True when an export response really carries the workbook. n8n answers with
 * JSON when the sheet is missing or the export failed, and a proxy can answer
 * with an HTML error page — neither is a spreadsheet.
 */
/**
 * @param {number} status
 * @param {string | null | undefined} contentType
 * @returns {boolean}
 */
export function isSpreadsheetResponse(status, contentType) {
  const type = String(contentType || "").toLowerCase();
  if (!Number.isFinite(status) || status < 200 || status >= 300) return false;
  if (type.includes("application/json") || type.includes("text/html")) return false;
  return true;
}

/**
 * Saves a blob through a temporary object URL. Returns false outside a browser
 * so the download flow can fall back instead of throwing.
 */
/**
 * @param {Blob | null | undefined} blob
 * @param {string} [fileName]
 * @returns {boolean}
 */
export function triggerDownload(blob, fileName) {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return false;
  if (!blob) return false;

  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = fileName || "Attendance.xlsx";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the click a tick to start the download before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  return true;
}

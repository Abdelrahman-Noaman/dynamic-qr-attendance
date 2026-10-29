// ============================================================
// The sheet a session writes to.
//
// The rules live in frontend/session-sheet.js so the dashboard and the Node
// tests share one implementation (same arrangement as location-core.js).
// ============================================================
import {
  googleSheetExportUrl,
  isSpreadsheetResponse,
  readSessionSheet,
  sessionSheetExportEndpoint,
  sessionSheetFileName,
  triggerDownload,
} from "../../../frontend/session-sheet.js";

export {
  googleSheetExportUrl,
  isSpreadsheetResponse,
  readSessionSheet,
  sessionSheetExportEndpoint,
  sessionSheetFileName,
  triggerDownload,
};

/** The workbook the workflow created for the live (or just stopped) session. */
export interface SessionSheet {
  sessionId: string;
  /** Tab inside the workbook; always `Attendance`. */
  tab: string;
  /** Workbook title, e.g. `Attendance - Data Security - S20261029-ABCD`. */
  title: string;
  /** Google Sheets editor URL. */
  url: string;
  /** Google's own .xlsx export URL, used when n8n cannot stream the file. */
  xlsxUrl: string;
}

export type SheetDownloadState = "idle" | "busy" | "saved" | "fallback" | "error";

export interface SheetDownloadNotice {
  state: SheetDownloadState;
  message: string;
}

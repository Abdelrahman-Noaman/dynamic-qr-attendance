// The dashboard side of the per-session workbook: reading the sheet the
// workflow reports, naming the download, and choosing a download route.
// frontend/session-sheet.js is the shared implementation the dashboard imports.
import assert from "node:assert/strict";
import test from "node:test";

import {
  googleSheetExportUrl,
  isSpreadsheetResponse,
  readSessionSheet,
  sessionSheetExportEndpoint,
  sessionSheetFileName,
  triggerDownload,
} from "../../frontend/session-sheet.js";

const N8N = "https://no3mannn.app.n8n.cloud/webhook";
const SHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz01234567890ab";

const payload = (overrides = {}) => ({
  sessionId: "S20261029-ABCD",
  tab: "Attendance",
  title: "Attendance - Data Security - S20261029-ABCD",
  url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
  xlsxUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`,
  ...overrides,
});

test("the reported session sheet is read as-is", () => {
  assert.deepEqual(readSessionSheet(payload()), payload());
});

test("a response without a sheet url yields no sheet", () => {
  assert.equal(readSessionSheet(null), null);
  assert.equal(readSessionSheet(undefined), null);
  assert.equal(readSessionSheet({}), null);
  assert.equal(readSessionSheet({ title: "Attendance", url: "   " }), null);
});

test("the Excel export link is derived from the sheet url when absent", () => {
  const sheet = readSessionSheet(payload({ xlsxUrl: undefined }));

  assert.equal(sheet.xlsxUrl, `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`);
  assert.equal(googleSheetExportUrl({ url: payload().url }), sheet.xlsxUrl);
  assert.equal(googleSheetExportUrl({ url: "not a sheet url" }), "");
});

test("the tab and title fall back to Attendance", () => {
  const sheet = readSessionSheet(payload({ tab: "", title: "  " }));

  assert.equal(sheet.tab, "Attendance");
  assert.equal(sheet.title, "Attendance");
});

test("the download file name is the workbook title plus .xlsx", () => {
  assert.equal(
    sessionSheetFileName(readSessionSheet(payload())),
    "Attendance - Data Security - S20261029-ABCD.xlsx",
  );
  assert.equal(sessionSheetFileName({ title: "Week 3/4: final?" }), "Week 3-4- final-.xlsx");
  assert.equal(sessionSheetFileName({ sessionId: "S20261029-ABCD" }), "Attendance-S20261029-ABCD.xlsx");
});

test("the export endpoint carries the professor key and the session", () => {
  assert.equal(
    sessionSheetExportEndpoint(N8N, { key: "MySecretyKey2005", sessionId: "S20261029-ABCD" }),
    `${N8N}/dqr-export?key=MySecretyKey2005&s=S20261029-ABCD`,
  );
  assert.equal(
    sessionSheetExportEndpoint(`${N8N}/`, { key: "k" }),
    `${N8N}/dqr-export?key=k`,
  );
});

test("only a real spreadsheet response is saved as a file", () => {
  assert.equal(
    isSpreadsheetResponse(200, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    true,
  );
  assert.equal(isSpreadsheetResponse(200, "application/octet-stream"), true);
  assert.equal(isSpreadsheetResponse(200, "application/json"), false, "an n8n error body is not a workbook");
  assert.equal(isSpreadsheetResponse(200, "text/html; charset=utf-8"), false);
  assert.equal(isSpreadsheetResponse(404, "application/octet-stream"), false);
  assert.equal(isSpreadsheetResponse(502, ""), false);
});

test("the blob download is a no-op outside a browser", () => {
  assert.equal(triggerDownload(new Blob(["x"]), "sheet.xlsx"), false);
  assert.equal(triggerDownload(null, "sheet.xlsx"), false);
});

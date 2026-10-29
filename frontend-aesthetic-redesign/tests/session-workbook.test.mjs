// One Google Sheet per attendance session.
//
// Every start must produce its own workbook (same Attendance columns as the
// shared prototype sheet), attendance must be appended to *that* workbook, and
// the stop must hand the professor the sheet plus a .xlsx download. The real
// n8n code nodes are executed here with mocked n8n globals.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = JSON.parse(
  fs.readFileSync(new URL("../../n8n/dynamic-qr-attendance.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""),
);
const node = (name) => {
  const found = workflow.nodes.find((item) => item.name === name);
  assert.ok(found, `workflow is missing the "${name}" node`);
  return found;
};
const targets = (from, output = 0) =>
  (workflow.connections[from]?.main[output] || []).map((edge) => edge.node);

const PROF_KEY = "MySecretyKey2005";
const LEGACY_SHEET_ID = "1W4Q8HrjGveP1jrjUzwho9aO7nRPPPDwwhfW7C1fdbD0";
const HALL = { latitude: 29.99625519, longitude: 30.96586222 };
const SHEET_COLUMNS = Object.keys(node("Save Attendance").parameters.columns.value);

/** Runs a code node with `$`, `$input` and workflow static data stubbed. */
function runCodeNode(name, { input = {}, staticData = {}, outputs = {} } = {}) {
  const { jsCode } = node(name).parameters;
  const $input = { first: () => ({ json: input }) };
  const $getWorkflowStaticData = () => staticData;
  const $ = (nodeName) => {
    assert.ok(nodeName in outputs, `test did not stub the output of "${nodeName}"`);
    return { first: () => ({ json: outputs[nodeName] }) };
  };
  const run = new Function("$input", "$getWorkflowStaticData", "$", jsCode);
  const result = run($input, $getWorkflowStaticData, $);
  return { output: result[0].json, staticData };
}

function startBody(overrides = {}) {
  return {
    key: PROF_KEY,
    lecture: "Data Security",
    instructorLatitude: String(HALL.latitude),
    instructorLongitude: String(HALL.longitude),
    instructorLocationSource: "map",
    instructorLocationConfirmedAt: String(Date.now()),
    ...overrides,
  };
}

const createdSpreadsheet = (spreadsheetId = "1AbCdEfGhIjKlMnOpQrStUvWxYz01234567890ab", title = "Attendance - Data Security") => ({
  spreadsheetId,
  spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  properties: { title },
  sheets: [{ properties: { sheetId: 0, title: "Attendance", index: 0 } }],
});

const headerWriteResponse = (spreadsheetId = "1AbCdEfGhIjKlMnOpQrStUvWxYz01234567890ab") => ({
  spreadsheetId,
  updatedRange: "Attendance!A1:Q1",
  updatedRows: 1,
  updatedColumns: SHEET_COLUMNS.length,
  updatedCells: SHEET_COLUMNS.length,
});

/** Start -> create workbook -> prepare -> write headers -> format -> activate. */
function startSession({ lecture = "Data Security", createResult, headerWrite, formatWrite, body } = {}) {
  const staticData = {};
  const started = runCodeNode("Create Session", {
    input: { body: body ?? startBody({ lecture }) },
    staticData,
  });
  if (!started.output.ok) return { started, staticData };

  const createJson = createResult ?? createdSpreadsheet(undefined, started.output.workbookTitle);
  const prepared = runCodeNode("Prepare Sheet Setup", {
    input: createJson,
    staticData,
    outputs: { "Create Session": started.output },
  });

  const formats = formatWrite ?? { spreadsheetId: createJson.spreadsheetId, replies: [{}, {}, {}] };
  const activated = runCodeNode("Activate Session", {
    input: formats,
    staticData,
    outputs: {
      "Create Session": started.output,
      "Prepare Sheet Setup": prepared.output,
      "Write Attendance Headers": headerWrite ?? headerWriteResponse(createJson.spreadsheetId),
      "Format Attendance Sheet": formats,
    },
  });

  return { started, prepared, activated, staticData, createJson };
}

function submitInput(session, overrides = {}) {
  const now = Date.now();
  return {
    sig: "valid",
    expectedSig: "valid",
    exp: now + 60_000,
    sessionId: session.sessionId,
    name: "Test Student",
    studentId: "0020230001",
    email: "student@university.edu",
    deviceId: "device-1",
    token: "ABC234",
    studentLatitude: HALL.latitude,
    studentLongitude: HALL.longitude,
    studentAccuracy: 12,
    studentLocationTimestamp: now,
    ...overrides,
  };
}

const submit = (session, overrides = {}) =>
  runCodeNode("Validate Submission", {
    input: submitInput(session, overrides),
    staticData: { session: structuredClone(session) },
  }).output;

// ============================================================
// Start: the session plans its own workbook
// ============================================================

test("Create Session plans a workbook titled after the lecture and the session", () => {
  const { output } = runCodeNode("Create Session", { input: { body: startBody() } });

  assert.equal(output.ok, true);
  assert.match(output.workbookTitle, /^Attendance - Data Security - S\d{8}-[A-Z0-9]{4}$/);
  assert.ok(output.workbookTitle.endsWith(output.sessionId), "the title carries the session id");
  assert.equal(output.workbookTab, "Attendance");
});

test("two sessions never plan the same workbook title", () => {
  const first = runCodeNode("Create Session", { input: { body: startBody() } }).output;
  const second = runCodeNode("Create Session", { input: { body: startBody() } }).output;

  assert.notEqual(first.sessionId, second.sessionId);
  assert.notEqual(first.workbookTitle, second.workbookTitle);
});

test("Drive-hostile characters are stripped from the workbook title", () => {
  const { output } = runCodeNode("Create Session", {
    input: { body: startBody({ lecture: "  Data   Security: week 3/4?  " }) },
  });

  assert.equal(/[/\\:?*[\]]/.test(output.workbookTitle), false);
  assert.match(output.workbookTitle, /^Attendance - Data Security week 3 4 - S\d{8}-[A-Z0-9]{4}$/);
});

test("the planned headers are exactly the columns the workflow appends", () => {
  const { output } = runCodeNode("Create Session", { input: { body: startBody() } });
  const schemaIds = node("Save Attendance").parameters.columns.schema.map((column) => column.id);

  assert.deepEqual(output.attendanceHeaders, SHEET_COLUMNS);
  assert.deepEqual(output.attendanceHeaders, schemaIds);
  assert.equal(output.attendanceHeaders.length, 17);
});

test("a rejected start never reaches the spreadsheet node", () => {
  assert.deepEqual(targets("Create Session"), ["Start OK?"]);
  assert.deepEqual(targets("Start OK?", 0), ["Create Attendance Workbook"]);
  assert.deepEqual(targets("Start OK?", 1), ["Respond Start"]);

  const { output } = runCodeNode("Create Session", { input: { body: startBody({ key: "wrong" }) } });
  assert.equal(output.ok, false);
  assert.equal("workbookTitle" in output, false, "no workbook is planned for a rejected start");
});

// ============================================================
// Workbook creation + Attendance headers
// ============================================================

test("the spreadsheet is created with a single Attendance tab", () => {
  const create = node("Create Attendance Workbook");

  assert.equal(create.parameters.resource, "spreadsheet");
  assert.equal(create.parameters.operation, "create");
  assert.match(create.parameters.title, /workbookTitle/);
  assert.equal(create.parameters.sheetsUi.sheetValues.length, 1);
  assert.match(create.parameters.sheetsUi.sheetValues[0].title, /workbookTab/);
  assert.equal(create.onError, "continueRegularOutput");
});

test("Prepare Sheet Setup writes the 17 Attendance headers into row 1", () => {
  const { prepared } = startSession();

  assert.equal(prepared.output.ok, true);
  assert.equal(prepared.output.tab, "Attendance");
  assert.equal(prepared.output.range, "Attendance!A1:Q1");
  assert.deepEqual(prepared.output.headerBody.values, [SHEET_COLUMNS]);
  assert.equal(
    prepared.output.valuesUrl,
    `https://sheets.googleapis.com/v4/spreadsheets/${prepared.output.workbookId}/values/Attendance!A1:Q1`,
  );
});

test("Prepare Sheet Setup keeps Student IDs as text and freezes the header row", () => {
  const { prepared } = startSession();
  const { requests } = prepared.output.formatBody;
  const studentIdColumn = SHEET_COLUMNS.indexOf("Student ID");

  const textColumn = requests.find((request) => request.repeatCell?.cell?.userEnteredFormat?.numberFormat);
  assert.equal(textColumn.repeatCell.range.startColumnIndex, studentIdColumn);
  assert.equal(textColumn.repeatCell.range.endColumnIndex, studentIdColumn + 1);
  assert.equal(textColumn.repeatCell.range.startRowIndex, 1, "data rows, not the header");
  assert.equal(textColumn.repeatCell.cell.userEnteredFormat.numberFormat.type, "TEXT");

  const boldHeader = requests.find((request) => request.repeatCell?.cell?.userEnteredFormat?.textFormat);
  assert.equal(boldHeader.repeatCell.range.startRowIndex, 0);
  assert.equal(boldHeader.repeatCell.range.endRowIndex, 1);
  assert.equal(boldHeader.repeatCell.cell.userEnteredFormat.textFormat.bold, true);

  const freeze = requests.find((request) => request.updateSheetProperties);
  assert.equal(freeze.updateSheetProperties.properties.gridProperties.frozenRowCount, 1);
});

test("Prepare Sheet Setup reports the sheet, its Excel export and the Drive export", () => {
  const { prepared, createJson } = startSession();
  const id = createJson.spreadsheetId;

  assert.equal(prepared.output.url, `https://docs.google.com/spreadsheets/d/${id}/edit`);
  assert.equal(prepared.output.xlsxUrl, `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
  assert.equal(
    prepared.output.exportUrl,
    `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )}`,
  );
  assert.equal(
    prepared.output.batchUpdateUrl,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`,
  );
});

test("Prepare Sheet Setup fails loudly when the spreadsheet was not created", () => {
  const { prepared } = startSession({
    createResult: { error: { message: "403: The caller does not have permission" } },
  });

  assert.equal(prepared.output.ok, false);
  assert.equal(prepared.output.error, "WORKBOOK_CREATE_FAILED");
  assert.match(prepared.output.detail, /does not have permission/);
});

// ============================================================
// Activation: a session is only live with a usable workbook
// ============================================================

test("Activate Session stores the workbook on the live session and reports it", () => {
  const { started, activated, staticData, createJson } = startSession();

  assert.equal(activated.output.ok, true);
  assert.equal(staticData.session.workbook.id, createJson.spreadsheetId);
  assert.equal(staticData.session.workbook.tab, "Attendance");
  assert.equal(staticData.session.workbook.formatted, true);
  assert.deepEqual(activated.output.attendanceSheet, {
    sessionId: started.output.sessionId,
    tab: "Attendance",
    title: started.output.workbookTitle,
    url: `https://docs.google.com/spreadsheets/d/${createJson.spreadsheetId}/edit`,
    xlsxUrl: `https://docs.google.com/spreadsheets/d/${createJson.spreadsheetId}/export?format=xlsx`,
  });
  // The internal plan does not leak into the professor-facing response.
  assert.equal("workbookTitle" in activated.output, false);
  assert.equal("attendanceHeaders" in activated.output, false);
});

test("the workbook is kept in a history so it can be downloaded after the stop", () => {
  const { activated, staticData, started } = startSession();

  assert.equal(activated.output.ok, true);
  assert.equal(staticData.workbooks.length, 1);
  assert.equal(staticData.workbooks[0].sessionId, started.output.sessionId);
  assert.equal(staticData.workbooks[0].id, staticData.session.workbook.id);
});

test("Activate Session refuses to start when the spreadsheet could not be created", () => {
  const { activated, staticData } = startSession({
    createResult: { error: { message: "quota exceeded" } },
  });

  assert.equal(activated.output.ok, false);
  assert.equal(activated.output.error, "WORKBOOK_CREATE_FAILED");
  assert.equal("session" in staticData, false, "the half-started session is rolled back");
});

test("Activate Session refuses to start when the header row could not be written", () => {
  const { activated, staticData } = startSession({
    headerWrite: { error: { message: "Requested writing range is invalid" } },
  });

  assert.equal(activated.output.ok, false);
  assert.equal(activated.output.error, "WORKBOOK_SETUP_FAILED");
  assert.match(activated.output.sheetUrl, /docs\.google\.com\/spreadsheets\/d\//);
  assert.equal("session" in staticData, false);
});

test("a missing updatedRange also counts as a failed header write", () => {
  const { activated } = startSession({ headerWrite: { spreadsheetId: "x" } });

  assert.equal(activated.output.ok, false);
  assert.equal(activated.output.error, "WORKBOOK_SETUP_FAILED");
});

test("formatting problems do not block the session", () => {
  const { activated, staticData } = startSession({ formatWrite: { error: { message: "batchUpdate failed" } } });

  assert.equal(activated.output.ok, true);
  assert.equal(staticData.session.workbook.formatted, false);
});

test("the start branch is wired end to end into one response", () => {
  assert.deepEqual(targets("Create Attendance Workbook"), ["Prepare Sheet Setup"]);
  assert.deepEqual(targets("Prepare Sheet Setup"), ["Write Attendance Headers"]);
  assert.deepEqual(targets("Write Attendance Headers"), ["Format Attendance Sheet"]);
  assert.deepEqual(targets("Format Attendance Sheet"), ["Activate Session"]);
  assert.deepEqual(targets("Activate Session"), ["Respond Start"]);

  const write = node("Write Attendance Headers").parameters;
  assert.equal(write.method, "PUT");
  assert.equal(write.authentication, "predefinedCredentialType");
  assert.equal(write.nodeCredentialType, "googleSheetsOAuth2Api");
  assert.match(write.url, /valuesUrl/);
  assert.match(write.jsonBody, /headerBody/);
  assert.deepEqual(write.queryParameters.parameters, [{ name: "valueInputOption", value: "RAW" }]);

  const format = node("Format Attendance Sheet").parameters;
  assert.equal(format.method, "POST");
  assert.match(format.url, /batchUpdateUrl/);
  assert.match(format.jsonBody, /formatBody/);
});

// ============================================================
// Students write into the session's own workbook
// ============================================================

test("attendance is appended to the session workbook, not the shared sheet", () => {
  const { activated, staticData } = startSession();
  const result = submit(staticData.session);

  assert.equal(result.valid, true);
  assert.equal(result.workbookId, staticData.session.workbook.id);
  assert.notEqual(result.workbookId, LEGACY_SHEET_ID);
  assert.equal(result.workbookIsFallback, false);
  assert.equal(result.workbookTab, "Attendance");
  assert.equal(activated.output.ok, true);

  for (const name of ["Check Duplicate", "Save Attendance", "Save Rejected Location"]) {
    const doc = node(name).parameters.documentId;
    assert.equal(doc.mode, "id");
    assert.match(doc.value, /\$\('Validate Submission'\)\.first\(\)\.json\.workbookId/);
    assert.equal(node(name).parameters.sheetName.value, "Attendance");
  }
});

test("a session without a workbook falls back to the shared prototype sheet", () => {
  const legacySession = {
    active: true,
    sessionId: "S20200101-AAAA",
    lecture: "Data Security",
    token: "ABC234",
    issuedAt: Date.now(),
    location: { latitude: HALL.latitude, longitude: HALL.longitude, accuracy: null, source: "map", confirmedAt: Date.now() },
    locationConfig: { radiusMeters: 100, maxAccuracyMeters: 50, maxAgeSeconds: 30 },
  };

  const result = submit(legacySession);

  assert.equal(result.valid, true);
  assert.equal(result.workbookId, LEGACY_SHEET_ID);
  assert.equal(result.workbookIsFallback, true);
});

test("the live QR poll exposes the sheet this session writes to", () => {
  const { staticData } = startSession();
  const { output } = runCodeNode("Rotate If Needed", {
    input: { query: { key: PROF_KEY } },
    staticData,
  });

  assert.equal(output.active, true);
  assert.equal(output.attendanceSheet.sessionId, staticData.session.sessionId);
  assert.equal(output.attendanceSheet.tab, "Attendance");
  assert.equal(output.attendanceSheet.title, staticData.session.workbook.title);
  assert.equal(output.attendanceSheet.url, staticData.session.workbook.url);
  assert.match(output.attendanceSheet.xlsxUrl, /export\?format=xlsx$/);
});

test("the stopped session still reports its sheet on the next poll", () => {
  const { staticData } = startSession();
  runCodeNode("Stop Session", { input: { body: { key: PROF_KEY } }, staticData });

  const { output } = runCodeNode("Rotate If Needed", {
    input: { query: { key: PROF_KEY } },
    staticData,
  });

  assert.equal(output.active, false);
  assert.equal(output.attendanceSheet.sessionId, staticData.session.sessionId);
  assert.equal(output.attendanceSheet.url, staticData.session.workbook.url);
});

test("a poll without any session reports no sheet", () => {
  const { output } = runCodeNode("Rotate If Needed", { input: { query: { key: PROF_KEY } }, staticData: {} });

  assert.equal(output.active, false);
  assert.equal(output.attendanceSheet, null);
});

// ============================================================
// Stop: the professor gets the sheet and the Excel download
// ============================================================

test("Stop Session returns the session sheet with its Excel download", () => {
  const { staticData, started } = startSession();
  const before = structuredClone(staticData.session);
  const { output } = runCodeNode("Stop Session", {
    input: { body: { key: PROF_KEY } },
    staticData,
  });

  assert.equal(output.ok, true);
  assert.equal(output.sessionId, started.output.sessionId);
  assert.deepEqual(output.attendanceSheet, {
    sessionId: before.sessionId,
    tab: "Attendance",
    title: before.workbook.title,
    url: before.workbook.url,
    xlsxUrl: before.workbook.xlsxUrl,
  });
  assert.equal(staticData.session.active, false);
  assert.equal(staticData.session.token, null);
  assert.equal(staticData.session.workbook.id, before.workbook.id, "still downloadable after the stop");
  assert.deepEqual(output.locationStats, before.locationStats);
});

test("Stop Session still needs the professor key", () => {
  const { staticData } = startSession();
  const { output } = runCodeNode("Stop Session", { input: { body: { key: "nope" } }, staticData });

  assert.equal(output.ok, false);
  assert.equal(output.error, "unauthorized");
  assert.equal(staticData.session.active, true);
});

// ============================================================
// /dqr-export: the .xlsx served through n8n
// ============================================================

const exportQuery = (staticData, overrides = {}) =>
  runCodeNode("Resolve Export", { input: { query: { key: PROF_KEY, ...overrides } }, staticData }).output;

test("the export endpoint streams the session workbook as .xlsx", () => {
  const { staticData, started } = startSession();
  const output = exportQuery(structuredClone(staticData));

  assert.equal(output.ok, true);
  assert.equal(output.workbookId, staticData.session.workbook.id);
  assert.equal(output.sessionId, started.output.sessionId);
  assert.equal(
    output.exportUrl,
    `https://www.googleapis.com/drive/v3/files/${staticData.session.workbook.id}/export?mimeType=${encodeURIComponent(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )}`,
  );
  assert.ok(output.fileName.endsWith(".xlsx"));
  assert.equal(/[/\\:*?"<>|]/.test(output.fileName.slice(0, -5)), false);
});

test("the export endpoint resolves a specific session from the workbook history", () => {
  const { staticData, started } = startSession();
  const afterStop = structuredClone(staticData);
  runCodeNode("Stop Session", { input: { body: { key: PROF_KEY } }, staticData: afterStop });

  const output = exportQuery(afterStop, { s: started.output.sessionId });

  assert.equal(output.ok, true);
  assert.equal(output.workbookId, staticData.session.workbook.id);
});

test("the export endpoint refuses a wrong key and unknown sessions", () => {
  const { staticData } = startSession();

  const unauthorized = runCodeNode("Resolve Export", {
    input: { query: { key: "wrong" } },
    staticData: structuredClone(staticData),
  }).output;
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.error, "unauthorized");
  assert.equal(unauthorized.responseCode, 401);

  const missing = exportQuery(structuredClone(staticData), { s: "S20200101-ZZZZ" });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "SHEET_NOT_FOUND");
  assert.equal(missing.responseCode, 404);
});

test("the export endpoint reports a clear error before any sheet exists", () => {
  const output = exportQuery({});

  assert.equal(output.ok, false);
  assert.equal(output.error, "SHEET_NOT_FOUND");
});

test("the export endpoint is wired to a binary response with an error branch", () => {
  assert.equal(node("Webhook Export").parameters.path, "dqr-export");
  assert.deepEqual(targets("Webhook Export"), ["Resolve Export"]);
  assert.deepEqual(targets("Resolve Export"), ["Export Ready?"]);
  assert.deepEqual(targets("Export Ready?", 0), ["Export XLSX"]);
  assert.deepEqual(targets("Export Ready?", 1), ["Respond Export Error"]);
  assert.deepEqual(targets("Export XLSX", 0), ["Respond XLSX"]);
  assert.deepEqual(targets("Export XLSX", 1), ["Respond Export Error"]);

  const request = node("Export XLSX").parameters;
  assert.equal(request.authentication, "predefinedCredentialType");
  assert.equal(request.nodeCredentialType, "googleSheetsOAuth2Api");
  assert.equal(request.options.response.response.responseFormat, "file");
  assert.equal(request.options.response.response.outputPropertyName, "data");

  const respond = node("Respond XLSX").parameters;
  assert.equal(respond.respondWith, "binary");
  assert.equal(respond.inputFieldName, "data");
});

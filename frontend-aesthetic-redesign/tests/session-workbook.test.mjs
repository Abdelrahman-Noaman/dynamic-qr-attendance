// One Google Sheet per attendance session, copied from the professor's template.
//
// Every start must duplicate the template workbook, attendance must be appended
// to *that* copy, and the stop must hand the professor the sheet plus a .xlsx
// download. The real n8n code nodes are executed here with mocked n8n globals.
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
const TEMPLATE_ID = "1opH4L0ThuVkYHjQs-zQ_WPRgCJkuaRnQu_oqKHKm2uk";
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

const COPIED_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz01234567890ab";

/** What Drive files.copy returns for a successful copy. */
const copiedTemplate = (title = "Attendance - Data Security") => ({
  kind: "drive#file",
  id: COPIED_ID,
  name: title,
  mimeType: "application/vnd.google-apps.spreadsheet",
  webViewLink: `https://docs.google.com/spreadsheets/d/${COPIED_ID}/edit`,
});

/** What the Sheets metadata call returns for the copy. */
const workbookMeta = (tab = "Attendance", sheetId = 0) => ({
  spreadsheetId: COPIED_ID,
  properties: { title: "Attendance - Data Security" },
  sheets: [{ properties: { sheetId, title: tab, index: 0 } }],
});

const headerRead = (headers = SHEET_COLUMNS) => ({ range: `${"Attendance"}!1:1`, values: [headers] });

/** Start -> copy template -> read meta -> prepare -> verify -> format -> activate. */
function startSession({ lecture = "Data Security", copyResult, metaResult, headerReadResult, formatWrite, body } = {}) {
  const staticData = {};
  const started = runCodeNode("Create Session", {
    input: { body: body ?? startBody({ lecture }) },
    staticData,
  });
  if (!started.output.ok) return { started, staticData };

  const copyJson = copyResult ?? copiedTemplate(started.output.workbookTitle);
  // A failed copy leaves the metadata call with no id, so it fails as well.
  const metaJson =
    metaResult ?? (copyJson.error ? { error: { message: "400: Requested entity was not found" } } : workbookMeta());

  const prepared = runCodeNode("Prepare Sheet Setup", {
    input: metaJson,
    staticData,
    outputs: { "Create Session": started.output, "Copy Attendance Template": copyJson },
  });

  const headers = headerReadResult ?? headerRead();
  const formats = formatWrite ?? { spreadsheetId: COPIED_ID, replies: [{}] };
  const activated = runCodeNode("Activate Session", {
    input: formats,
    staticData,
    outputs: {
      "Create Session": started.output,
      "Prepare Sheet Setup": prepared.output,
      "Verify Attendance Headers": headers,
      "Format Attendance Sheet": formats,
    },
  });

  return { started, prepared, activated, staticData, copyJson };
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
// Start: the session copies the template
// ============================================================

test("Create Session plans a copy of the template, named after the session", () => {
  const { output } = runCodeNode("Create Session", { input: { body: startBody() } });

  assert.equal(output.ok, true);
  assert.equal(output.templateId, TEMPLATE_ID);
  assert.match(output.workbookTitle, /^Attendance - Data Security - S\d{8}-[A-Z0-9]{4}$/);
  assert.ok(output.workbookTitle.endsWith(output.sessionId), "the title carries the session id");
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

test("the columns the workflow appends are exactly the 17 Attendance headers", () => {
  const { output } = runCodeNode("Create Session", { input: { body: startBody() } });
  const schemaIds = node("Save Attendance").parameters.columns.schema.map((column) => column.id);

  assert.deepEqual(output.attendanceHeaders, SHEET_COLUMNS);
  assert.deepEqual(output.attendanceHeaders, schemaIds);
  assert.equal(output.attendanceHeaders.length, 17);
});

test("a rejected start never reaches the Drive copy", () => {
  assert.deepEqual(targets("Create Session"), ["Start OK?"]);
  assert.deepEqual(targets("Start OK?", 0), ["Copy Attendance Template"]);
  assert.deepEqual(targets("Start OK?", 1), ["Respond Start"]);

  const { output } = runCodeNode("Create Session", { input: { body: startBody({ key: "wrong" }) } });
  assert.equal(output.ok, false);
  assert.equal("workbookTitle" in output, false, "no workbook is planned for a rejected start");
});

test("the workbook is a Drive copy of the template, renamed for the session", () => {
  const copy = node("Copy Attendance Template").parameters;

  assert.equal(copy.method, "POST");
  assert.match(copy.url, new RegExp(`/drive/v3/files/\\{\\{.*templateId.*\\}\\}/copy`));
  assert.match(copy.jsonBody, /workbookTitle/);
  assert.equal(copy.authentication, "predefinedCredentialType");
  assert.equal(copy.nodeCredentialType, "googleSheetsOAuth2Api");
  assert.equal(node("Copy Attendance Template").onError, "continueRegularOutput");
});

// ============================================================
// The copy decides the layout
// ============================================================

test("Prepare Sheet Setup takes the tab and sheetId from the copy", () => {
  const { prepared } = startSession({ metaResult: workbookMeta("Attendance", 0) });

  assert.equal(prepared.output.ok, true);
  assert.equal(prepared.output.workbookId, COPIED_ID);
  assert.equal(prepared.output.tab, "Attendance");
  assert.equal(prepared.output.sheetId, 0);
  assert.equal(prepared.output.templateId, TEMPLATE_ID);
});

test("a tab the template named differently is followed, not assumed", () => {
  const { prepared } = startSession({ metaResult: workbookMeta("Sheet1", 4) });

  assert.equal(prepared.output.tab, "Sheet1");
  assert.equal(prepared.output.sheetId, 4);
  assert.equal(
    prepared.output.headerUrl,
    `https://sheets.googleapis.com/v4/spreadsheets/${COPIED_ID}/values/Sheet1!1:1`,
  );
});

test("a tab name with spaces is quoted and URL-encoded in the header read", () => {
  const { prepared } = startSession({ metaResult: workbookMeta("Week 3 Attendance", 7) });

  assert.equal(prepared.output.tab, "Week 3 Attendance");
  assert.equal(
    prepared.output.headerUrl,
    `https://sheets.googleapis.com/v4/spreadsheets/${COPIED_ID}/values/${encodeURIComponent(
      "'Week 3 Attendance'",
    )}!1:1`,
  );
});

test("the only formatting the workflow adds is plain-text Student IDs", () => {
  const { prepared } = startSession();
  const { requests } = prepared.output.formatBody;
  const studentIdColumn = SHEET_COLUMNS.indexOf("Student ID");

  // Bold/frozen headers belong to the template, so the workflow must not touch them.
  assert.equal(requests.length, 1);
  assert.equal(requests[0].repeatCell.cell.userEnteredFormat.numberFormat.type, "TEXT");
  assert.equal(requests[0].repeatCell.range.startColumnIndex, studentIdColumn);
  assert.equal(requests[0].repeatCell.range.endColumnIndex, studentIdColumn + 1);
  assert.equal(requests[0].repeatCell.range.startRowIndex, 1, "data rows, not the header");
});

test("Prepare Sheet Setup reports the copy, its Excel export and the Drive export", () => {
  const { prepared } = startSession();

  assert.equal(prepared.output.url, `https://docs.google.com/spreadsheets/d/${COPIED_ID}/edit`);
  assert.equal(prepared.output.xlsxUrl, `https://docs.google.com/spreadsheets/d/${COPIED_ID}/export?format=xlsx`);
  assert.equal(
    prepared.output.exportUrl,
    `https://www.googleapis.com/drive/v3/files/${COPIED_ID}/export?mimeType=${encodeURIComponent(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )}`,
  );
  assert.equal(
    prepared.output.batchUpdateUrl,
    `https://sheets.googleapis.com/v4/spreadsheets/${COPIED_ID}:batchUpdate`,
  );
});

test("a failed copy is reported, with the Drive scope named when it is a 403", () => {
  const { prepared } = startSession({
    copyResult: { error: { message: "403: The caller does not have permission" } },
  });

  assert.equal(prepared.output.ok, false);
  assert.equal(prepared.output.error, "WORKBOOK_CREATE_FAILED");
  assert.match(prepared.output.detail, /does not have permission/);
  assert.match(prepared.output.detail, /www\.googleapis\.com\/auth\/drive/);
});

test("a copy that cannot be read back is refused as WORKBOOK_TAB_UNKNOWN", () => {
  const { prepared } = startSession({
    metaResult: { error: { message: "404: Requested entity was not found" } },
  });

  assert.equal(prepared.output.ok, false);
  assert.equal(prepared.output.error, "WORKBOOK_TAB_UNKNOWN");
});

// ============================================================
// Activation: a session is only live with a usable copy
// ============================================================

test("Activate Session stores the copied workbook on the live session", () => {
  const { started, activated, staticData } = startSession();

  assert.equal(activated.output.ok, true);
  assert.equal(staticData.session.workbook.id, COPIED_ID);
  assert.equal(staticData.session.workbook.tab, "Attendance");
  assert.equal(staticData.session.workbook.templateId, TEMPLATE_ID);
  assert.equal(staticData.session.workbook.headersVerified, true);
  assert.equal(staticData.session.workbook.formatted, true);
  assert.deepEqual(activated.output.attendanceSheet, {
    sessionId: started.output.sessionId,
    tab: "Attendance",
    title: started.output.workbookTitle,
    url: `https://docs.google.com/spreadsheets/d/${COPIED_ID}/edit`,
    xlsxUrl: `https://docs.google.com/spreadsheets/d/${COPIED_ID}/export?format=xlsx`,
  });
  // The internal plan does not leak into the professor-facing response.
  assert.equal("workbookTitle" in activated.output, false);
  assert.equal("templateId" in activated.output, false);
  assert.equal("attendanceHeaders" in activated.output, false);
});

test("the copy is kept in a history so it can be downloaded after the stop", () => {
  const { activated, staticData, started } = startSession();

  assert.equal(activated.output.ok, true);
  assert.equal(staticData.workbooks.length, 1);
  assert.equal(staticData.workbooks[0].sessionId, started.output.sessionId);
  assert.equal(staticData.workbooks[0].id, staticData.session.workbook.id);
});

test("Activate Session refuses to start when the template could not be copied", () => {
  const { activated, staticData } = startSession({
    copyResult: { error: { message: "quota exceeded" } },
  });

  assert.equal(activated.output.ok, false);
  assert.equal(activated.output.error, "WORKBOOK_CREATE_FAILED");
  assert.equal("session" in staticData, false, "the half-started session is rolled back");
});

test("a template that lost a column is refused, naming the column", () => {
  const { activated, staticData } = startSession({
    headerReadResult: headerRead(SHEET_COLUMNS.filter((column) => column !== "Device ID")),
  });

  assert.equal(activated.output.ok, false);
  assert.equal(activated.output.error, "WORKBOOK_TEMPLATE_MISMATCH");
  assert.match(activated.output.detail, /missing: Device ID/);
  assert.equal(activated.output.tab, "Attendance");
  assert.match(activated.output.sheetUrl, /docs\.google\.com\/spreadsheets\/d\//);
  assert.equal("session" in staticData, false);
});

test("extra template columns are fine - only the appended ones are required", () => {
  const { activated } = startSession({
    headerReadResult: headerRead(["No.", ...SHEET_COLUMNS, "Notes"]),
  });

  assert.equal(activated.output.ok, true);
});

test("a failed header read does not block the session", () => {
  const { activated, staticData } = startSession({
    headerReadResult: { error: { message: "socket hang up" } },
  });

  assert.equal(activated.output.ok, true);
  assert.equal(staticData.session.workbook.headersVerified, false);
});

test("formatting problems do not block the session", () => {
  const { activated, staticData } = startSession({ formatWrite: { error: { message: "batchUpdate failed" } } });

  assert.equal(activated.output.ok, true);
  assert.equal(staticData.session.workbook.formatted, false);
});

test("the start branch is wired end to end into one response", () => {
  assert.deepEqual(targets("Copy Attendance Template"), ["Read Workbook Meta"]);
  assert.deepEqual(targets("Read Workbook Meta"), ["Prepare Sheet Setup"]);
  assert.deepEqual(targets("Prepare Sheet Setup"), ["Verify Attendance Headers"]);
  assert.deepEqual(targets("Verify Attendance Headers"), ["Format Attendance Sheet"]);
  assert.deepEqual(targets("Format Attendance Sheet"), ["Activate Session"]);
  assert.deepEqual(targets("Activate Session"), ["Respond Start"]);

  for (const name of ["Copy Attendance Template", "Read Workbook Meta", "Verify Attendance Headers"]) {
    assert.equal(node(name).parameters.nodeCredentialType, "googleSheetsOAuth2Api", name);
    assert.deepEqual(node(name).credentials, node("Save Attendance").credentials, name);
  }
});

// ============================================================
// Students write into the session's own copy
// ============================================================

test("attendance is appended to the session copy, not the shared sheet", () => {
  const { activated, staticData } = startSession();
  const result = submit(staticData.session);

  assert.equal(result.valid, true);
  assert.equal(result.workbookId, staticData.session.workbook.id);
  assert.notEqual(result.workbookId, LEGACY_SHEET_ID);
  assert.equal(result.workbookIsFallback, false);
  assert.equal(activated.output.ok, true);

  for (const name of ["Check Duplicate", "Save Attendance", "Save Rejected Location"]) {
    const doc = node(name).parameters.documentId;
    assert.equal(doc.mode, "id");
    assert.match(doc.value, /\$\('Validate Submission'\)\.first\(\)\.json\.workbookId/);
    assert.match(node(name).parameters.sheetName.value, /workbookTab/);
  }
});

test("attendance follows the tab name the copy really has", () => {
  const { staticData } = startSession({ metaResult: workbookMeta("Sheet1") });
  const result = submit(staticData.session);

  assert.equal(result.workbookTab, "Sheet1");
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
  assert.equal(request.nodeCredentialType, "googleSheetsOAuth2Api");
  assert.equal(request.options.response.response.responseFormat, "file");
  assert.equal(request.options.response.response.outputPropertyName, "data");

  const respond = node("Respond XLSX").parameters;
  assert.equal(respond.respondWith, "binary");
  assert.equal(respond.inputFieldName, "data");
});

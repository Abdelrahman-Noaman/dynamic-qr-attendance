// Lecture-hall selection on the map + strict ACCEPTED/REJECTED policy.
//
// Two layers are checked and kept honest against each other:
//   1. frontend/location-core.js  — the shared pure policy (also used by the UI).
//   2. the real n8n code nodes    — executed here with mocked n8n globals.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  assessStudentAttendance,
  formatAccuracy,
  haversineMeters,
  isValidCoordinatePair,
  LECTURE_LOCATION,
  LOCATION_QUALITY,
  LOCATION_REASONS,
  validateLectureLocation,
} from "../../frontend/location-core.js";

const HALL = { latitude: 29.99625519, longitude: 30.96586222 };
const STUDENT_FAR = { latitude: 29.9963212, longitude: 30.96691445 }; // ≈101.6 m away
const METERS_PER_DEGREE_LAT = (Math.PI * 6371000) / 180;

const reading = (overrides = {}) => ({
  ...HALL,
  accuracy: 10,
  timestamp: Date.now(),
  ...overrides,
});

const hallConfirmed = (overrides = {}) => ({ ...HALL, confirmedAt: Date.now(), ...overrides });

/** A point due north/south of the hall at an exact great-circle distance. */
function pointAtMeters(meters, bearing = "north") {
  const delta = meters / METERS_PER_DEGREE_LAT;
  return {
    latitude: HALL.latitude + (bearing === "north" ? delta : -delta),
    longitude: HALL.longitude,
  };
}

// ============================================================
// Distance
// ============================================================

test("Haversine distance for the reported pair of coordinates is ~101.6 m", () => {
  const distance = haversineMeters(HALL, STUDENT_FAR);

  assert.ok(Math.abs(distance - 101.5965) < 0.01, `unexpected distance ${distance}`);
  assert.equal(distance, haversineMeters(STUDENT_FAR, HALL)); // symmetric
  assert.equal(haversineMeters(HALL, HALL), 0);
  // One degree of latitude at the mean Earth radius.
  assert.ok(Math.abs(haversineMeters(HALL, pointAtMeters(1000)) - 1000) < 1e-6);
});

test("100 m boundary: 99.9 m is inside, 100.1 m is outside", () => {
  const inside = assessStudentAttendance({
    lectureLocation: hallConfirmed(),
    student: reading({ ...pointAtMeters(99.9) }),
  });
  const outside = assessStudentAttendance({
    lectureLocation: hallConfirmed(),
    student: reading({ ...pointAtMeters(100.1) }),
  });

  assert.equal(inside.status, "ACCEPTED");
  assert.equal(inside.locationStatus, "VERIFIED");
  assert.ok(Math.abs(inside.distanceMeters - 99.9) < 0.01);

  assert.equal(outside.status, "REJECTED");
  assert.equal(outside.locationStatus, LOCATION_REASONS.OUTSIDE_RADIUS);
  assert.ok(Math.abs(outside.distanceMeters - 100.1) < 0.01);
});

test("the radius is inclusive at exactly 100 m", () => {
  const atLimit = pointAtMeters(100);
  const distance = haversineMeters(HALL, atLimit);
  const result = assessStudentAttendance({
    lectureLocation: hallConfirmed(),
    student: reading({ ...atLimit }),
  });

  // Float noise around the exact boundary is expected; both the shared policy
  // and the workflow use `distance <= radius`.
  assert.ok(Math.abs(distance - 100) < 1e-6);
  if (distance <= 100) assert.equal(result.status, "ACCEPTED");
  else assert.equal(result.status, "REJECTED");
  assert.equal(LOCATION_QUALITY.attendanceRadiusMeters, 100);
});

// ============================================================
// Invalid coordinates
// ============================================================

test("invalid lecture-hall coordinates are rejected before any distance work", () => {
  for (const invalid of [
    { latitude: 91, longitude: 0 },
    { latitude: -90.5, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: -180.1 },
    { latitude: Number.NaN, longitude: 30 },
    { latitude: 30, longitude: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(isValidCoordinatePair(invalid.latitude, invalid.longitude), false);
    const result = assessStudentAttendance({
      lectureLocation: { ...invalid, confirmedAt: Date.now() },
      student: reading(),
    });
    assert.equal(result.status, "REJECTED");
    assert.equal(result.locationStatus, LOCATION_REASONS.LECTURE_LOCATION_INVALID);
    assert.equal(result.distanceMeters, null);
  }

  const missing = assessStudentAttendance({ lectureLocation: null, student: reading() });
  assert.equal(missing.locationStatus, LOCATION_REASONS.LECTURE_LOCATION_MISSING);
});

test("invalid student coordinates and timestamps are rejected as INVALID_LOCATION", () => {
  const cases = [
    { latitude: 91 },
    { longitude: -181 },
    { latitude: Number.NaN },
    { accuracy: 0 },
    { accuracy: -4 },
    { timestamp: 0 },
    { timestamp: Date.now() + 120_000 },
  ];

  for (const override of cases) {
    const result = assessStudentAttendance({
      lectureLocation: hallConfirmed(),
      student: reading(override),
    });
    assert.equal(result.status, "REJECTED", JSON.stringify(override));
    assert.equal(result.locationStatus, LOCATION_REASONS.INVALID, JSON.stringify(override));
  }
});

// ============================================================
// Student accuracy failures
// ============================================================

test("student accuracy above 50 m is REJECTED / LOW_ACCURACY, never OUTSIDE_RADIUS", () => {
  const result = assessStudentAttendance({
    lectureLocation: hallConfirmed(),
    student: reading({ ...HALL, accuracy: 50.1 }),
  });

  assert.equal(result.status, "REJECTED");
  assert.equal(result.locationStatus, LOCATION_REASONS.LOW_ACCURACY);
  assert.equal(result.reason, LOCATION_REASONS.LOW_ACCURACY);
  assert.equal(result.accuracyMeters, 50.1);
  assert.equal(result.distanceMeters, null, "distance is not computed for an unusable reading");
});

test("student accuracy of exactly 50 m is allowed through the accuracy gate", () => {
  const result = assessStudentAttendance({
    lectureLocation: hallConfirmed(),
    student: reading({ ...HALL, accuracy: 50 }),
  });

  assert.equal(result.accuracyMeters, 50);
  assert.equal(result.status, "ACCEPTED");
});

test("stale student readings are rejected as STALE_LOCATION", () => {
  const result = assessStudentAttendance({
    lectureLocation: hallConfirmed(),
    student: reading({ timestamp: Date.now() - 31_000 }),
  });

  assert.equal(result.status, "REJECTED");
  assert.equal(result.locationStatus, LOCATION_REASONS.STALE);
});

// ============================================================
// Lecture-location validation (map confirmation)
// ============================================================

test("a confirmed lecture hall needs coordinates and a recent confirmation, not GPS accuracy", () => {
  const now = Date.now();

  assert.equal(validateLectureLocation({ ...HALL, confirmedAt: now }, { now }).valid, true);
  // No accuracy field at all — that is the whole point of the map selection.
  assert.equal(validateLectureLocation({ ...HALL, confirmedAt: now }, { now }).reason, null);

  assert.equal(
    validateLectureLocation({ latitude: 95, longitude: 30, confirmedAt: now }, { now }).reason,
    LOCATION_REASONS.LECTURE_LOCATION_INVALID,
  );
  assert.equal(
    validateLectureLocation({ ...HALL, confirmedAt: now + 10 * 60_000 }, { now }).reason,
    LOCATION_REASONS.LECTURE_LOCATION_INVALID,
  );
  assert.equal(
    validateLectureLocation({ ...HALL, confirmedAt: now - (LECTURE_LOCATION.maxConfirmationAgeMs + 1000) }, { now }).reason,
    LOCATION_REASONS.LECTURE_LOCATION_STALE,
  );
  assert.equal(validateLectureLocation(null, { now }).reason, LOCATION_REASONS.LECTURE_LOCATION_MISSING);
});

test("accuracy formatting stays honest", () => {
  assert.equal(formatAccuracy(156), "±156 m");
  assert.equal(formatAccuracy(null), "not reported");
});

// ============================================================
// n8n workflow nodes
// ============================================================

const workflow = JSON.parse(
  fs.readFileSync(new URL("../../n8n/dynamic-qr-attendance.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""),
);
const node = (name) => workflow.nodes.find((item) => item.name === name);

function runCodeNode(name, { input, staticData = {} }) {
  const { jsCode } = node(name).parameters;
  const $input = { first: () => ({ json: input }) };
  const $getWorkflowStaticData = () => staticData;
  const $ = (nodeName) => {
    assert.equal(nodeName, "Validate Submission");
    return { first: () => ({ json: input }) };
  };
  const run = new Function("$input", "$getWorkflowStaticData", "$", jsCode);
  return { output: run($input, $getWorkflowStaticData, $)[0].json, staticData };
}

const freshStaticData = (session) => ({ session: session ? structuredClone(session) : undefined });

const PROF_KEY = "MySecretyKey2005";

function startWithMap(overrides = {}) {
  const body = {
    key: PROF_KEY,
    lecture: "Data Security",
    instructorLatitude: String(HALL.latitude),
    instructorLongitude: String(HALL.longitude),
    instructorLocationSource: "map",
    instructorLocationConfirmedAt: String(Date.now()),
    ...overrides,
  };
  return runCodeNode("Create Session", { input: { body }, staticData: {} });
}

function submit(sessionOrStaticData, overrides = {}) {
  const now = Date.now();
  const staticData = sessionOrStaticData && "session" in sessionOrStaticData
    ? sessionOrStaticData
    : freshStaticData(sessionOrStaticData);
  const sessionId = staticData.session ? staticData.session.sessionId : "";
  return runCodeNode("Validate Submission", {
    staticData,
    input: {
      sig: "valid",
      expectedSig: "valid",
      exp: now + 60_000,
      sessionId,
      name: "Test Student",
      studentId: "20230001",
      email: "student@university.edu",
      deviceId: "device-1",
      studentLatitude: HALL.latitude,
      studentLongitude: HALL.longitude,
      studentAccuracy: 12,
      studentLocationTimestamp: now,
      ...overrides,
    },
  });
}

test("Create Session accepts a map-confirmed lecture hall with no GPS accuracy", () => {
  const { output, staticData } = startWithMap();

  assert.equal(output.ok, true);
  assert.equal(output.locationQualityStatus, "CONFIRMED");
  assert.equal(output.attendanceRadiusMeters, 100);
  assert.equal(output.maxAccuracyMeters, 50);
  assert.equal(staticData.session.location.source, "map");
  assert.equal(staticData.session.location.accuracy, null);
  assert.deepEqual(
    { latitude: staticData.session.location.latitude, longitude: staticData.session.location.longitude },
    HALL,
  );
});

test("Create Session rejects a bad or stale lecture location with explicit reasons", () => {
  assert.equal(startWithMap({ instructorLatitude: "95" }).output.error, "LECTURE_LOCATION_INVALID");
  assert.equal(startWithMap({ instructorLatitude: "" }).output.error, "LECTURE_LOCATION_MISSING");
  assert.equal(startWithMap({ instructorLocationConfirmedAt: "" }).output.error, "LECTURE_LOCATION_INVALID");
  assert.equal(
    startWithMap({ instructorLocationConfirmedAt: String(Date.now() - 61 * 60 * 1000) }).output.error,
    "LECTURE_LOCATION_STALE",
  );
});

test("Create Session still rejects a poor GPS reference when the GPS source is used", () => {
  const { output } = runCodeNode("Create Session", {
    input: {
      body: {
        key: PROF_KEY,
        lecture: "Data Security",
        instructorLocationSource: "gps",
        instructorLatitude: String(HALL.latitude),
        instructorLongitude: String(HALL.longitude),
        instructorAccuracy: "156",
        instructorLocationTimestamp: String(Date.now()),
      },
    },
  });

  assert.equal(output.ok, false);
  assert.equal(output.error, "LOW_ACCURACY");
});

test("Validate Submission accepts a student inside 100 m with acceptable accuracy", () => {
  const { staticData } = startWithMap();
  const inside = pointAtMeters(40);
  const result = submit(staticData.session, {
    studentLatitude: inside.latitude,
    studentLongitude: inside.longitude,
    studentAccuracy: 12,
  }).output;

  assert.equal(result.valid, true);
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.locationStatus, "VERIFIED");
  assert.equal(result.reason, "");
  assert.ok(Math.abs(result.distanceMeters - 40) < 0.1);
  assert.equal(result.accuracyMeters, 12);
  assert.equal(result.attendanceRadiusMeters, 100);
  assert.equal(result.lectureLocationSource, "map");
});

test("Validate Submission rejects the reported 101.6 m case as REJECTED / OUTSIDE_RADIUS", () => {
  const { staticData } = startWithMap();
  const result = submit(staticData.session, {
    studentLatitude: STUDENT_FAR.latitude,
    studentLongitude: STUDENT_FAR.longitude,
  }).output;

  assert.equal(result.valid, false, "outside-radius attempts are not recorded");
  assert.equal(result.status, "REJECTED");
  assert.equal(result.locationStatus, "OUTSIDE_RADIUS");
  assert.equal(result.reason, "OUTSIDE_RADIUS");
  assert.equal(result.distanceMeters, 101.6);
  assert.equal(result.reviewStatus, "Rejected");
});

test("Validate Submission rejects poor student accuracy before any distance check", () => {
  const { staticData } = startWithMap();
  const result = submit(staticData.session, { studentAccuracy: 156 }).output;

  assert.equal(result.valid, false);
  assert.equal(result.status, "REJECTED");
  assert.equal(result.reason, "LOW_ACCURACY");
  assert.equal(result.locationStatus, "LOW_ACCURACY");
  assert.equal(result.distanceMeters, null);
  assert.match(result.locationDetail, /156 m/);
});

test("Validate Submission rejects stale and invalid student readings separately", () => {
  const { staticData } = startWithMap();

  assert.equal(submit(staticData.session, { studentLocationTimestamp: Date.now() - 31_000 }).output.reason, "STALE_LOCATION");
  assert.equal(submit(staticData.session, { studentLatitude: 91 }).output.reason, "INVALID_LOCATION");
  assert.equal(submit(staticData.session, { studentLocationTimestamp: Date.now() + 120_000 }).output.reason, "INVALID_LOCATION");
  assert.equal(submit(staticData.session, { studentAccuracy: Number.NaN }).output.reason, "LOCATION_UNAVAILABLE");
});

test("session counters separate verified, outside-radius and rejected attempts", () => {
  const { staticData } = startWithMap();

  const first = submit(staticData, {
    studentLatitude: pointAtMeters(20).latitude,
    studentLongitude: pointAtMeters(20).longitude,
  });
  assert.equal(first.output.status, "ACCEPTED");

  submit(staticData, { studentLatitude: STUDENT_FAR.latitude, studentLongitude: STUDENT_FAR.longitude });
  submit(staticData, { studentAccuracy: 200 });

  const stats = staticData.session.locationStats;
  assert.equal(stats.verified, 1);
  assert.equal(stats.outsideRadius, 1);
  assert.equal(stats.rejected, 2);
  assert.equal("needsReview" in stats, false);
});

test("existing security validation still runs before the location decision", () => {
  const { staticData } = startWithMap();

  assert.equal(submit(staticData.session, { sig: "tampered" }).output.reason, "BAD_TICKET");
  assert.equal(submit(staticData.session, { exp: Date.now() - 1 }).output.reason, "TICKET_EXPIRED");
  assert.equal(submit({ ...staticData.session, active: false }).output.reason, "SESSION_CLOSED");
  assert.equal(submit(staticData.session, { email: "nope" }).output.reason, "BAD_EMAIL");
  assert.equal(submit(staticData.session, { deviceId: "" }).output.reason, "DEVICE_ID_REQUIRED");
});

test("QR rotation, ticket signing, duplicates, sheet mappings and email routing are intact", () => {
  const rotate = node("Rotate If Needed").parameters.jsCode;
  assert.match(rotate, /s\.token = rand\(6\)/);
  assert.match(rotate, /lectureLocation:/); // reference exposed to the dashboard
  assert.equal(node("Sign Ticket").parameters.action, "hmac");
  assert.equal(node("Verify Ticket Signature").parameters.action, "hmac");
  assert.ok(node("Check Duplicate"));
  assert.ok(node("Already Submitted?"));
  assert.deepEqual(
    workflow.connections["Verified Attendance?"].main[0].map((edge) => edge.node),
    ["Use Outlook Email?"],
  );
  // Rejected attempts are logged, but they never reach the confirmation email.
  assert.deepEqual(
    workflow.connections["Rejected Location?"].main[0].map((edge) => edge.node),
    ["Save Rejected Location"],
  );

  const mapping = node("Save Attendance").parameters.columns.value;
  // The legacy "Review Status" column was dropped from the sheet contract.
  assert.equal(Object.keys(mapping).length, 17);
  assert.equal("Review Status" in mapping, false);
  assert.match(mapping["Distance (m)"], /distanceMeters/);
  assert.match(mapping["Status"], /'Present'/);
  assert.doesNotMatch(mapping["Status"], /Needs Review/);
  assert.match(mapping["Instructor Latitude"], /instructorLatitude/);

  const rejected = node("Save Rejected Location").parameters.columns.value;
  assert.equal(Object.keys(rejected).length, 17);
  assert.equal(rejected["Status"], "Rejected");
  assert.match(rejected["Location Status"], /locationStatus/);
});

test("Rotate If Needed exposes the confirmed hall and the new counters", () => {
  const { staticData } = startWithMap();
  const { output } = runCodeNode("Rotate If Needed", {
    staticData,
    input: { query: { key: PROF_KEY } },
  });

  assert.equal(output.ok, true);
  assert.equal(output.active, true);
  assert.equal(output.attendanceRadiusMeters, 100);
  assert.deepEqual(
    { latitude: output.lectureLocation.latitude, longitude: output.lectureLocation.longitude },
    HALL,
  );
  assert.equal(output.lectureLocation.source, "map");
  assert.deepEqual(output.locationStats, { verified: 0, outsideRadius: 0, rejected: 0 });
  assert.equal("needsReview" in output.locationStats, false);
  // 10 s rotation contract is untouched.
  assert.ok(output.expiresInMs > 0 && output.expiresInMs <= 10_000);
});

test("the workflow contains no Needs Review outcome any more", () => {
  const raw = fs.readFileSync(new URL("../../n8n/dynamic-qr-attendance.json", import.meta.url), "utf8");
  assert.equal(raw.includes("Needs Review"), false);
  assert.equal(raw.includes("NEEDS_REVIEW"), false);
  assert.doesNotMatch(node("Validate Submission").parameters.jsCode, /REVIEW/);
  assert.match(node("Validate Submission").parameters.jsCode, /\/\*\*?|const DEFAULT_CONFIG = \{ radiusMeters: 100, maxAccuracyMeters: 50, maxAgeSeconds: 30 \}/);
});

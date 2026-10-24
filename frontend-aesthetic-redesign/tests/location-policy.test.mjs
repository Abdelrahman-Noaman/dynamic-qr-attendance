// Policy + workflow contract checks.
//
// The policy itself lives in frontend/location-core.js and is exercised here
// through assessStudentAttendance, the same function the dashboard/student page
// and the tests share. The node-by-node workflow matrix is in
// lecture-location.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  assessStudentAttendance,
  haversineMeters,
  isWithinAttendanceRadius,
  LOCATION_QUALITY,
  LOCATION_REASONS,
  validateLectureLocation,
} from "../../frontend/location-core.js";

const RADIUS_METERS = LOCATION_QUALITY.attendanceRadiusMeters;
const MAX_ACCURACY_METERS = LOCATION_QUALITY.targetAccuracyMeters;
const MAX_AGE_SECONDS = LOCATION_QUALITY.maxReadingAgeMs / 1000;

const hall = { latitude: 30.0444, longitude: 31.2357, confirmedAt: Date.now() };
const reading = (overrides = {}) => ({
  latitude: hall.latitude,
  longitude: hall.longitude,
  accuracy: 10,
  timestamp: Date.now(),
  ...overrides,
});

const decide = (student, options = {}) =>
  assessStudentAttendance({ lectureLocation: hall, student, ...options });

assert.equal(RADIUS_METERS, 100);
assert.equal(MAX_ACCURACY_METERS, 50);

// Inside the radius and accurate → accepted.
assert.equal(decide(reading()).status, "ACCEPTED");
assert.equal(decide(reading()).locationStatus, "VERIFIED");

// ~330 m away → rejected for distance, never "needs review".
const far = decide(reading({ latitude: hall.latitude + 0.003 }));
assert.equal(far.status, "REJECTED");
assert.equal(far.locationStatus, LOCATION_REASONS.OUTSIDE_RADIUS);
assert.ok(far.distanceMeters > RADIUS_METERS);

// Imprecise reading → rejected for accuracy, not distance.
const imprecise = decide(reading({ accuracy: 51 }));
assert.equal(imprecise.status, "REJECTED");
assert.equal(imprecise.locationStatus, LOCATION_REASONS.LOW_ACCURACY);
assert.equal(imprecise.distanceMeters, null);

// Stale / invalid readings keep their own reason codes.
assert.equal(decide(reading({ timestamp: Date.now() - (MAX_AGE_SECONDS + 1) * 1000 })).locationStatus, LOCATION_REASONS.STALE);
assert.equal(decide(reading({ accuracy: 0 })).locationStatus, LOCATION_REASONS.INVALID);
assert.equal(decide(reading({ latitude: 91 })).locationStatus, LOCATION_REASONS.INVALID);
assert.equal(assessStudentAttendance({ lectureLocation: null, student: reading() }).status, "REJECTED");

// No outcome may be a review state any more.
const statuses = new Set(
  [decide(reading()), far, imprecise].map((result) => `${result.status}/${result.locationStatus}`),
);
assert.deepEqual([...statuses].sort(), ["ACCEPTED/VERIFIED", "REJECTED/LOW_ACCURACY", "REJECTED/OUTSIDE_RADIUS"]);

// A map-confirmed hall has no accuracy requirement of its own.
assert.equal(validateLectureLocation(hall).valid, true);
assert.deepEqual(Object.keys(hall).includes("accuracy"), false);
assert.equal(haversineMeters(hall, hall), 0);
assert.equal(isWithinAttendanceRadius(RADIUS_METERS), true);
assert.equal(isWithinAttendanceRadius(RADIUS_METERS + 0.01), false);

console.log("Location policy tests passed");

const workflow = JSON.parse(
  fs.readFileSync(new URL("../../n8n/dynamic-qr-attendance.json", import.meta.url), "utf8").replace(/^\uFEFF/, "")
);
const node = (name) => workflow.nodes.find((item) => item.name === name);
const startWebhook = node("Webhook Start");
const qrWebhook = node("Webhook QR");
const createSession = node("Create Session");
const rotateQr = node("Rotate If Needed");
const validateSubmission = node("Validate Submission");

assert.equal(startWebhook.parameters.httpMethod, "POST");
assert.equal(startWebhook.parameters.path, "dqr-start");
assert.equal(qrWebhook.parameters.path, "dqr-qr");
assert.match(createSession.parameters.jsCode, /const ATTENDANCE_RADIUS_METERS = 100;/);
assert.match(createSession.parameters.jsCode, /const MAX_GPS_ACCURACY_METERS = 50;/);
assert.match(createSession.parameters.jsCode, /instructorLocationSource/);
assert.match(createSession.parameters.jsCode, /LECTURE_LOCATION_MAX_AGE_MINUTES/);
assert.doesNotMatch(createSession.parameters.jsCode, /LOCATION_QUALITY_POLICY/);
assert.doesNotMatch(validateSubmission.parameters.jsCode, /NEEDS_REVIEW|Needs Review/);
assert.match(rotateQr.parameters.jsCode, /s\.token = rand\(6\)/);
assert.ok(workflow.connections["Webhook Start"].main[0].some((edge) => edge.node === "Create Session"));
assert.ok(workflow.connections["Create Session"].main[0].some((edge) => edge.node === "Respond Start"));

const assess = ({ instructor, student, radius = 100, maxAccuracy = 50, maxAge = 30, now = 1_000_000 }) => {
  if (!instructor || !student) return { locationStatus: "REJECTED", reason: "LOCATION_UNAVAILABLE" };
  if (instructor.accuracy > maxAccuracy || student.accuracy > maxAccuracy) {
    return { locationStatus: "REJECTED", reason: "LOW_ACCURACY" };
  }
  if (now - student.timestamp > maxAge * 1000) {
    return { locationStatus: "REJECTED", reason: "STALE_LOCATION" };
  }
  const distanceMeters = distance(instructor, student);
  return distanceMeters <= radius
    ? { locationStatus: "VERIFIED", reason: "", distanceMeters }
    : { locationStatus: "REJECTED", reason: "OUTSIDE_RADIUS", distanceMeters };
};

test("accurate student inside 100 m is verified", () => {
  const result = assess({
    instructor: { latitude: 30, longitude: 31, accuracy: 10 },
    student: { latitude: 30.0001, longitude: 31, accuracy: 10, timestamp: 1_000_000 },
  });
  assert.equal(result.locationStatus, "VERIFIED");
});

test("accurate student outside 100 m is rejected as outside radius", () => {
  const result = assess({
    instructor: { latitude: 30, longitude: 31, accuracy: 10 },
    student: { latitude: 30.002, longitude: 31, accuracy: 10, timestamp: 1_000_000 },
  });
  assert.deepEqual(result.reason, "OUTSIDE_RADIUS");
  assert.equal(result.locationStatus, "REJECTED");
});

test("poor accuracy is rejected without claiming the student is outside", () => {
  const result = assess({
    instructor: { latitude: 30, longitude: 31, accuracy: 202 },
    student: { latitude: 30.002, longitude: 31, accuracy: 10, timestamp: 1_000_000 },
  });
  assert.deepEqual(result, { locationStatus: "REJECTED", reason: "LOW_ACCURACY" });
});

test("missing and stale readings are rejected", () => {
  assert.equal(assess({}).reason, "LOCATION_UNAVAILABLE");
  assert.equal(assess({
    instructor: { latitude: 30, longitude: 31, accuracy: 10 },
    student: { latitude: 30, longitude: 31, accuracy: 10, timestamp: 0 },
  }).reason, "STALE_LOCATION");
});

test("supplied coordinates calculate to 101.5965363156 m", () => {
  const result = distance(
    { latitude: 29.99625519, longitude: 30.96586222 },
    { latitude: 29.9963212, longitude: 30.96691445 }
  );
  assert.ok(Math.abs(result - 101.59653631559846) < 0.000001);
});

test("workflow uses strict outcomes and preserves security checks", () => {
  assert.match(validateCode, /OUTSIDE_RADIUS/);
  assert.match(validateCode, /LOW_ACCURACY/);
  assert.match(validateCode, /TICKET_EXPIRED/);
  assert.match(validateCode, /BAD_TICKET/);
  assert.match(validateCode, /deviceId/);
  assert.ok(workflow.nodes.some((node) => node.name === "Save Rejected Location"));
  assert.ok(workflow.nodes.some((node) => node.name === "Rejected Location?"));
});

// Policy + workflow contract checks.
//
// The location policy no longer lives as a copy inside this test: it imports the
// shared module that the instructor dashboard and the student page both use, and
// the behaviour of the exported n8n code nodes is covered in
// location-acquisition.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  haversineMeters,
  isWithinAttendanceRadius,
  LOCATION_QUALITY,
  LOCATION_REASONS,
  validateReading,
} from "../../frontend/location-core.js";

const RADIUS_METERS = LOCATION_QUALITY.attendanceRadiusMeters;
const MAX_ACCURACY_METERS = LOCATION_QUALITY.targetAccuracyMeters;
const MAX_AGE_SECONDS = LOCATION_QUALITY.maxReadingAgeMs / 1000;

// Decision helper mirroring the server-side ordering: validity -> freshness ->
// accuracy quality -> distance. Accuracy problems are never reported as being
// outside the radius.
function assessLocation({ instructor, student, now, policy = "REVIEW" }) {
  for (const reading of [instructor, student]) {
    if (!reading) return "REJECTED";
    const check = validateReading(reading, { now });
    if (!check.valid) return check.reason === LOCATION_REASONS.STALE ? "STALE_LOCATION" : "INVALID_LOCATION";
  }
  if (instructor.accuracy > MAX_ACCURACY_METERS) return "INSTRUCTOR_LOW_ACCURACY";
  if (student.accuracy > MAX_ACCURACY_METERS) return "LOW_ACCURACY";
  if (haversineMeters(instructor, student) <= RADIUS_METERS) return "VERIFIED";
  return policy === "REVIEW" ? "OUTSIDE_RADIUS" : "REJECTED";
}

const now = Date.now();
const base = {
  latitude: 30.0444,
  longitude: 31.2357,
  accuracy: 10,
  timestamp: now,
};

assert.equal(assessLocation({ instructor: base, student: base, now }), "VERIFIED");
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, latitude: 30.047 },
    now,
  }),
  "OUTSIDE_RADIUS"
);
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, latitude: 30.047 },
    now,
    policy: "REJECT",
  }),
  "REJECTED"
);
// Accuracy above the target is its own technical outcome, not "outside radius".
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, accuracy: 51 },
    now,
  }),
  "LOW_ACCURACY"
);
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, accuracy: 0 },
    now,
  }),
  "INVALID_LOCATION"
);
assert.equal(
  assessLocation({
    instructor: { ...base, accuracy: 51 },
    student: base,
    now,
  }),
  "INSTRUCTOR_LOW_ACCURACY"
);
assert.equal(assessLocation({ instructor: null, student: base, now }), "REJECTED");
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, timestamp: now - (MAX_AGE_SECONDS + 1) * 1000 },
    now,
  }),
  "STALE_LOCATION"
);
// The earlier duplicate policy returned NEEDS_REVIEW for every >50 m reading,
// which is what merged "imprecise" with "outside the radius". Guard against it.
assert.notEqual(
  assessLocation({ instructor: base, student: { ...base, accuracy: 51 }, now }),
  "OUTSIDE_RADIUS"
);
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

assert.equal(startWebhook.parameters.httpMethod, "POST");
assert.equal(startWebhook.parameters.path, "dqr-start");
assert.equal(qrWebhook.parameters.path, "dqr-qr");
assert.match(createSession.parameters.jsCode, /LOCATION_QUALITY_POLICY = 'REVIEW'/);
assert.match(createSession.parameters.jsCode, /locationQualityStatus/);
assert.match(createSession.parameters.jsCode, /const ATTENDANCE_RADIUS_METERS = 100;/);
assert.match(createSession.parameters.jsCode, /const MAX_GPS_ACCURACY_METERS = 50;/);
assert.match(rotateQr.parameters.jsCode, /s\.token = rand\(6\)/);
assert.ok(workflow.connections["Webhook Start"].main[0].some((edge) => edge.node === "Create Session"));
assert.ok(workflow.connections["Create Session"].main[0].some((edge) => edge.node === "Respond Start"));

console.log("Start-session and QR contract tests passed");

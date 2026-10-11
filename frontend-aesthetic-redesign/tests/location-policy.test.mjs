import assert from "node:assert/strict";
import fs from "node:fs";

const RADIUS_METERS = 100;
const MAX_ACCURACY_METERS = 50;
const MAX_AGE_SECONDS = 30;

function haversineMeters(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function assessLocation({ instructor, student, now, policy = "REVIEW" }) {
  if (!instructor || !student) return "REJECTED";
  const readings = [instructor, student];
  if (
    readings.some(
      (reading) =>
        !Number.isFinite(reading.latitude) ||
        !Number.isFinite(reading.longitude) ||
        !Number.isFinite(reading.accuracy) ||
        !Number.isFinite(reading.timestamp) ||
        reading.latitude < -90 ||
        reading.latitude > 90 ||
        reading.longitude < -180 ||
        reading.longitude > 180
    )
  ) {
    return "REJECTED";
  }
  if (
    readings.some(
      (reading) =>
        reading.accuracy <= 0 ||
        now - reading.timestamp > MAX_AGE_SECONDS * 1000 ||
        now - reading.timestamp < 0
    )
  ) {
    return "REJECTED";
  }
  if (readings.some((reading) => reading.accuracy > MAX_ACCURACY_METERS)) {
    return policy === "REVIEW" ? "NEEDS_REVIEW" : "REJECTED";
  }
  return haversineMeters(instructor, student) <= RADIUS_METERS
    ? "VERIFIED"
    : policy === "REVIEW"
      ? "NEEDS_REVIEW"
      : "REJECTED";
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
  "NEEDS_REVIEW"
);
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, accuracy: 51 },
    now,
  }),
  "NEEDS_REVIEW"
);
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, accuracy: 51 },
    now,
    policy: "REJECT",
  }),
  "REJECTED"
);
assert.equal(assessLocation({ instructor: null, student: base, now }), "REJECTED");
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, timestamp: now - 31_000 },
    now,
  }),
  "REJECTED"
);
assert.equal(
  assessLocation({
    instructor: base,
    student: { ...base, latitude: 31 },
    now,
  }),
  "NEEDS_REVIEW"
);

console.log("Location policy tests passed");

const workflow = JSON.parse(
  fs.readFileSync("../n8n/dynamic-qr-attendance.json", "utf8").replace(/^\uFEFF/, "")
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
assert.match(rotateQr.parameters.jsCode, /s\.token = rand\(6\)/);
assert.ok(workflow.connections["Webhook Start"].main[0].some((edge) => edge.node === "Create Session"));
assert.ok(workflow.connections["Create Session"].main[0].some((edge) => edge.node === "Respond Start"));

console.log("Start-session and QR contract tests passed");

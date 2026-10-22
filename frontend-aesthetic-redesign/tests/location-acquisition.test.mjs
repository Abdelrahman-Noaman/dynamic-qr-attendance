import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  acquireLocation,
  formatAccuracy,
  haversineMeters,
  isWithinAttendanceRadius,
  LocationError,
  LOCATION_ACQUISITION,
  LOCATION_QUALITY,
  LOCATION_REASONS,
  pickBestReading,
  validateReading,
} from "../../frontend/location-core.js";

// ============================================================
// Fixtures
// ============================================================

// The instructor/student pair from the reported attendance row.
const INSTRUCTOR = { latitude: 29.99625519, longitude: 30.96586222 };
const STUDENT = { latitude: 29.9963212, longitude: 30.96691445 };

const reading = (overrides = {}) => ({
  ...INSTRUCTOR,
  accuracy: 12,
  timestamp: Date.now(),
  ...overrides,
});

const position = (coords, timestamp = Date.now()) => ({
  coords: { latitude: INSTRUCTOR.latitude, longitude: INSTRUCTOR.longitude, ...coords },
  timestamp,
});

/** Fake Geolocation implementation: each call consumes the next scripted step. */
function fakeGeolocation(script) {
  const calls = [];
  return {
    calls,
    getCurrentPosition(success, failure, options) {
      calls.push(options);
      const step = script[Math.min(calls.length - 1, script.length - 1)];
      // Real implementations answer asynchronously.
      queueMicrotask(() => {
        if (!step) return; // never answers → exercises the bounded timeout
        if (step.error) failure(step.error);
        else success(step.position);
      });
    },
  };
}

const permissionDenied = { code: 1, PERMISSION_DENIED: 1 };
const positionUnavailable = { code: 2, POSITION_UNAVAILABLE: 2 };
const browserTimeout = { code: 3, TIMEOUT: 3 };

// ============================================================
// Shared acquisition / quality checks
// ============================================================

test("fresh reading is valid and reports its accuracy", () => {
  const now = Date.now();
  const check = validateReading(reading({ timestamp: now - 2000 }), { now });

  assert.equal(check.valid, true);
  assert.equal(check.reason, null);
  assert.equal(check.accuracyMeters, 12);
  assert.ok(check.ageMs >= 2000);
  assert.match(check.message, /±12 m/);
});

test("stale reading is rejected instead of being reused as current", () => {
  const now = Date.now();
  const check = validateReading(reading({ timestamp: now - 31_000 }), { now });

  assert.equal(check.valid, false);
  assert.equal(check.reason, LOCATION_REASONS.STALE);
  assert.match(check.message, /31\.0 s old/);
  // Exactly at the limit is still fresh.
  assert.equal(validateReading(reading({ timestamp: now - 30_000 }), { now }).valid, true);
});

test("reading with a timestamp in the future is rejected", () => {
  const now = Date.now();
  const check = validateReading(reading({ timestamp: now + 60_000 }), { now });

  assert.equal(check.valid, false);
  assert.equal(check.reason, LOCATION_REASONS.INVALID);
  assert.match(check.message, /future/);
});

test("out-of-range coordinates and invalid accuracy are rejected", () => {
  const now = Date.now();
  const cases = [
    { latitude: 91 },
    { latitude: -90.5 },
    { longitude: 180.5 },
    { longitude: -181 },
    { latitude: Number.NaN },
    { longitude: Number.POSITIVE_INFINITY },
    { accuracy: 0 },
    { accuracy: -5 },
    { accuracy: Number.NaN },
    { timestamp: 0 },
    { timestamp: Number.NaN },
  ];

  for (const override of cases) {
    const check = validateReading(reading({ now, ...override }), { now });
    assert.equal(check.valid, false, `expected rejection for ${JSON.stringify(override)}`);
    assert.equal(check.reason, LOCATION_REASONS.INVALID);
  }

  assert.equal(validateReading(null, { now }).reason, LOCATION_REASONS.INVALID);
});

test("pickBestReading keeps the most accurate fresh reading and drops stale ones", () => {
  const now = Date.now();
  const best = pickBestReading(
    [
      reading({ accuracy: 80, timestamp: now }),
      reading({ accuracy: 12, timestamp: now - 5_000 }),
      // Most accurate, but stale: must not win.
      reading({ accuracy: 3, timestamp: now - 45_000 }),
      reading({ accuracy: Number.NaN, timestamp: now }),
    ],
    { now },
  );

  assert.ok(best);
  assert.equal(best.accuracy, 12);
  assert.equal(pickBestReading([reading({ timestamp: now - 45_000 })], { now }), null);
});

test("acquisition requests high accuracy, refuses cached fixes, and bounds each call", async () => {
  const geolocation = fakeGeolocation([{ position: position({ accuracy: 8 }) }]);

  const acquired = await acquireLocation(geolocation, { maxAttempts: 1 });

  assert.equal(acquired.precisionMet, true);
  assert.equal(acquired.reading.accuracy, 8);
  assert.equal(geolocation.calls.length, 1);
  assert.deepEqual(geolocation.calls[0], {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: LOCATION_ACQUISITION.perReadingTimeoutMs,
  });
});

test("poor accuracy triggers another reading and the better fresh reading wins", async () => {
  const geolocation = fakeGeolocation([
    { position: position({ accuracy: 120 }) },
    { position: position({ accuracy: 8 }) },
  ]);
  const phases = [];

  const acquired = await acquireLocation(geolocation, {
    allowPoorAccuracy: false,
    onProgress: (progress) => phases.push(progress.phase),
  });

  assert.equal(acquired.attempts, 2);
  assert.equal(acquired.reading.accuracy, 8);
  assert.equal(acquired.precisionMet, true);
  assert.deepEqual(phases, ["requesting", "reading", "retrying", "requesting", "reading"]);
});

test("all readings too imprecise rejects with LOW_ACCURACY, not OUTSIDE_RADIUS", async () => {
  const geolocation = fakeGeolocation([{ position: position({ accuracy: 120 }) }]);

  await assert.rejects(
    () => acquireLocation(geolocation, { allowPoorAccuracy: false }),
    (error) => {
      assert.ok(error instanceof LocationError);
      assert.equal(error.reason, LOCATION_REASONS.LOW_ACCURACY);
      assert.equal(error.details.accuracyMeters, 120);
      assert.equal(error.details.targetMeters, LOCATION_QUALITY.targetAccuracyMeters);
      assert.match(error.message, /±120 m/);
      assert.match(error.message, /not a guarantee/);
      return true;
    },
  );

  // The instructor flow keeps the REVIEW policy: poor readings are returned,
  // flagged as not meeting the target, so the session can start as NEEDS_REVIEW.
  const instructor = await acquireLocation(
    fakeGeolocation([{ position: position({ accuracy: 120 }) }]),
    { allowPoorAccuracy: true },
  );
  assert.equal(instructor.precisionMet, false);
  assert.equal(instructor.reading.accuracy, 120);
});

test("acquisition stops after the bounded window with a clear timeout error", async () => {
  const geolocation = fakeGeolocation([null]); // never answers

  await assert.rejects(
    () =>
      acquireLocation(geolocation, {
        maxAttempts: 1,
        perReadingTimeoutMs: 30,
        totalTimeoutMs: 40,
      }),
    (error) => {
      assert.ok(error instanceof LocationError);
      assert.equal(error.reason, LOCATION_REASONS.TIMEOUT);
      assert.match(error.message, /within 0 s|within \d+ s/);
      return true;
    },
  );
});

test("permission denial fails immediately without retrying", async () => {
  const geolocation = fakeGeolocation([{ error: permissionDenied }]);

  await assert.rejects(
    () => acquireLocation(geolocation, { maxAttempts: 3 }),
    (error) => {
      assert.ok(error instanceof LocationError);
      assert.equal(error.reason, LOCATION_REASONS.PERMISSION_DENIED);
      return true;
    },
  );
  assert.equal(geolocation.calls.length, 1);
});

test("unavailable service and missing API are reported as LOCATION_UNAVAILABLE", async () => {
  await assert.rejects(
    () => acquireLocation(fakeGeolocation([{ error: positionUnavailable }]), { maxAttempts: 2 }),
    (error) => {
      assert.equal(error.reason, LOCATION_REASONS.UNAVAILABLE);
      assert.equal(error.details.attempts, 2);
      return true;
    },
  );

  await assert.rejects(
    () => acquireLocation(null, {}),
    (error) => error.reason === LOCATION_REASONS.UNAVAILABLE,
  );
});

test("browser timeouts are retried within the attempt budget", async () => {
  const geolocation = fakeGeolocation([{ error: browserTimeout }, { position: position({ accuracy: 20 }) }]);

  const acquired = await acquireLocation(geolocation, { maxAttempts: 3 });

  assert.equal(acquired.attempts, 2);
  assert.equal(acquired.reading.accuracy, 20);
  assert.equal(geolocation.calls.length, 2);
});

test("acquisition never exceeds maxAttempts", async () => {
  const geolocation = fakeGeolocation([{ position: position({ accuracy: 300 }) }]);

  await assert.rejects(
    () => acquireLocation(geolocation, { maxAttempts: 2, allowPoorAccuracy: false }),
    (error) => error.reason === LOCATION_REASONS.LOW_ACCURACY,
  );
  assert.equal(geolocation.calls.length, 2);
});

// ============================================================
// Distance calculation
// ============================================================

test("Haversine distance for the reported row is ~101.6 m, not 12.99 m", () => {
  const distance = haversineMeters(INSTRUCTOR, STUDENT);

  assert.ok(Math.abs(distance - 101.5965) < 0.01, `unexpected distance ${distance}`);
  assert.ok(distance > LOCATION_QUALITY.attendanceRadiusMeters);
  // Symmetry and identity sanity checks.
  assert.ok(Math.abs(distance - haversineMeters(STUDENT, INSTRUCTOR)) < 1e-9);
  assert.equal(haversineMeters(INSTRUCTOR, INSTRUCTOR), 0);
});

test("100 m radius boundary is applied to the distance, not to GPS accuracy", () => {
  // ~88.9 m north of the reference point (1e-3 degrees latitude ≈ 111.2 m).
  const inside = { latitude: INSTRUCTOR.latitude + 0.0008, longitude: INSTRUCTOR.longitude };
  const outside = { latitude: INSTRUCTOR.latitude + 0.00095, longitude: INSTRUCTOR.longitude };

  assert.ok(isWithinAttendanceRadius(haversineMeters(INSTRUCTOR, inside)));
  assert.ok(!isWithinAttendanceRadius(haversineMeters(INSTRUCTOR, outside)));
  assert.equal(LOCATION_QUALITY.attendanceRadiusMeters, 100);
  assert.equal(LOCATION_QUALITY.targetAccuracyMeters, 50);
});

test("accuracy formatting is explicit in meters", () => {
  assert.equal(formatAccuracy(12.4), "±12 m");
  assert.equal(formatAccuracy(0), "not reported");
  assert.equal(formatAccuracy(null), "not reported");
});

// ============================================================
// n8n workflow: run the exported code nodes with mocked n8n globals
// ============================================================

const workflow = JSON.parse(
  fs.readFileSync(new URL("../../n8n/dynamic-qr-attendance.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""),
);
const workflowNode = (name) => workflow.nodes.find((node) => node.name === name);

function runCodeNode(name, { input, session }) {
  const { jsCode } = workflowNode(name).parameters;
  const staticData = { session: session ? structuredClone(session) : undefined };
  const $input = { first: () => ({ json: input }) };
  const $getWorkflowStaticData = () => staticData;
  const run = new Function("$input", "$getWorkflowStaticData", jsCode);
  return { output: run($input, $getWorkflowStaticData)[0].json, staticData };
}

const PROF_KEY = "MySecretyKey2005";

function startSession(overrides = {}) {
  const body = {
    key: PROF_KEY,
    lecture: "Data Security",
    instructorLatitude: String(INSTRUCTOR.latitude),
    instructorLongitude: String(INSTRUCTOR.longitude),
    instructorAccuracy: "10",
    instructorLocationTimestamp: String(Date.now()),
    ...overrides,
  };
  return runCodeNode("Create Session", { input: { body } });
}

function submission(session, overrides = {}) {
  const now = Date.now();
  return runCodeNode("Validate Submission", {
    session,
    input: {
      sig: "valid-signature",
      expectedSig: "valid-signature",
      exp: now + 60_000,
      sessionId: session.sessionId,
      name: "Test Student",
      studentId: "20230001",
      email: "student@university.edu",
      deviceId: "device-1",
      studentLatitude: STUDENT.latitude,
      studentLongitude: STUDENT.longitude,
      studentAccuracy: 10,
      studentLocationTimestamp: now,
      ...overrides,
    },
  }).output;
}

test("Create Session keeps the 100 m radius and 50 m accuracy target separate", () => {
  const { output, staticData } = startSession();

  assert.equal(output.ok, true);
  assert.equal(output.attendanceRadiusMeters, 100);
  assert.equal(output.maxAccuracyMeters, 50);
  assert.equal(output.locationQualityStatus, "VERIFIED");
  assert.deepEqual(staticData.session.locationConfig, {
    radiusMeters: 100,
    maxAccuracyMeters: 50,
    maxAgeSeconds: 30,
    policy: "REVIEW",
  });
});

test("Create Session rejects stale and invalid instructor readings with explicit reasons", () => {
  assert.equal(
    startSession({ instructorLocationTimestamp: String(Date.now() - 31_000) }).output.error,
    "STALE_LOCATION",
  );
  assert.equal(startSession({ instructorLatitude: "123" }).output.error, "INVALID_LOCATION");
  assert.equal(startSession({ instructorAccuracy: "0" }).output.error, "INVALID_LOCATION");
  assert.equal(startSession({ instructorLocationTimestamp: "" }).output.error, "LOCATION_UNAVAILABLE");
  assert.equal(
    startSession({ instructorLocationTimestamp: String(Date.now() + 120_000) }).output.error,
    "INVALID_LOCATION",
  );
});

test("Create Session marks a poor-quality instructor reading as NEEDS_REVIEW (REVIEW policy)", () => {
  const { output } = startSession({ instructorAccuracy: "80" });

  assert.equal(output.ok, true);
  assert.equal(output.locationQualityStatus, "NEEDS_REVIEW");
});

test("Validate Submission records the reported row as 101.6 m OUTSIDE_RADIUS, not verified", () => {
  const { staticData } = startSession();
  const result = submission(staticData.session);

  assert.equal(result.valid, true, `unexpected rejection: ${result.reason}`);
  assert.equal(result.reason, "");
  assert.equal(result.locationStatus, "OUTSIDE_RADIUS");
  assert.equal(result.reviewStatus, "Needs Review");
  assert.equal(result.distanceMeters, 101.6);
  assert.equal(result.attendanceRadiusMeters, 100);
  // The coordinates written to the sheet are the ones the distance used.
  assert.equal(result.instructorLatitude, INSTRUCTOR.latitude);
  assert.equal(result.instructorLongitude, INSTRUCTOR.longitude);
  assert.equal(result.studentLatitude, STUDENT.latitude);
  assert.equal(result.studentLongitude, STUDENT.longitude);
});

test("Validate Submission verifies a genuinely close reading", () => {
  const { staticData } = startSession();
  const result = submission(staticData.session, {
    studentLatitude: INSTRUCTOR.latitude + 0.0008,
    studentLongitude: INSTRUCTOR.longitude,
  });

  assert.equal(result.locationStatus, "VERIFIED");
  assert.equal(result.reviewStatus, "Confirmed");
  assert.equal(result.reason, "");
  assert.ok(result.distanceMeters < 100);
});

test("Validate Submission rejects poor student accuracy as LOW_ACCURACY, never OUTSIDE_RADIUS", () => {
  const { staticData } = startSession();
  const result = submission(staticData.session, { studentAccuracy: 80 });

  assert.equal(result.valid, false);
  assert.equal(result.reason, "LOW_ACCURACY");
  assert.equal(result.locationStatus, "LOW_ACCURACY");
  assert.equal(result.distanceMeters, null);
  assert.match(result.locationDetail, /80 m, worse than the 50 m quality target/);
});

test("Validate Submission rejects stale and invalid student readings separately", () => {
  const { staticData } = startSession();

  const stale = submission(staticData.session, { studentLocationTimestamp: Date.now() - 31_000 });
  assert.equal(stale.reason, "STALE_LOCATION");
  assert.match(stale.locationDetail, /31\.\d s old/);

  const invalid = submission(staticData.session, { studentLatitude: 91 });
  assert.equal(invalid.reason, "INVALID_LOCATION");

  const future = submission(staticData.session, { studentLocationTimestamp: Date.now() + 60_000 });
  assert.equal(future.reason, "INVALID_LOCATION");

  const missing = submission(staticData.session, { studentAccuracy: Number.NaN });
  assert.equal(missing.reason, "LOCATION_UNAVAILABLE");
});

test("Validate Submission reports an imprecise instructor reference separately", () => {
  const { staticData } = startSession({ instructorAccuracy: "80" });
  const result = submission(staticData.session);

  assert.equal(result.valid, false);
  assert.equal(result.reason, "INSTRUCTOR_LOW_ACCURACY");
  assert.equal(result.locationStatus, "INSTRUCTOR_LOW_ACCURACY");
});

test("Validate Submission still enforces session, ticket, duplicate-path and email checks", () => {
  const { staticData } = startSession();

  assert.equal(submission(staticData.session, { sig: "tampered" }).reason, "BAD_TICKET");
  assert.equal(submission(staticData.session, { exp: Date.now() - 1 }).reason, "TICKET_EXPIRED");
  assert.equal(submission({ ...staticData.session, active: false }).reason, "SESSION_CLOSED");
  assert.equal(submission(staticData.session, { email: "not-an-email" }).reason, "BAD_EMAIL");
  assert.equal(submission(staticData.session, { deviceId: "" }).reason, "DEVICE_ID_REQUIRED");
});

test("Google Sheets mappings and the verified-only email path are unchanged", () => {
  const mapping = workflowNode("Save Attendance").parameters.columns.value;
  assert.deepEqual(Object.keys(mapping), [
    "Session ID",
    "Student ID",
    "Device ID",
    "Student Name",
    "Email",
    "Attendance Time",
    "Token",
    "Status",
    "Instructor Latitude",
    "Instructor Longitude",
    "Student Latitude",
    "Student Longitude",
    "Distance (m)",
    "Instructor GPS Accuracy (m)",
    "Student GPS Accuracy (m)",
    "Location Status",
    "Location Timestamp",
    "Review Status",
  ]);
  assert.match(mapping["Distance (m)"], /distanceMeters/);
  assert.match(mapping["Location Status"], /locationStatus/);
  assert.match(mapping["Status"], /=== 'VERIFIED' \? 'Present' : 'Needs Review'/);

  const sign = workflowNode("Sign Ticket");
  const verify = workflowNode("Verify Ticket Signature");
  assert.equal(sign.parameters.action, "hmac");
  assert.equal(verify.parameters.action, "hmac");
  assert.equal(workflowNode("Already Submitted?").type, "n8n-nodes-base.if");
  const verifiedBranch = workflow.connections["Verified Location?"].main[0];
  assert.deepEqual(verifiedBranch.map((edge) => edge.node), ["Use Outlook Email?"]);
});

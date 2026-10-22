// Drives the real module script from frontend/student-attendance.html with a
// stubbed DOM/geolocation/fetch, so the shared-module wiring, the acquisition
// options and the submitted field mapping are exercised end to end (in Node,
// not on a device — this is not a live GPS test).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as location from "../../frontend/location-core.js";

const html = fs.readFileSync(new URL("../../frontend/student-attendance.html", import.meta.url), "utf8");
const moduleSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(moduleSource, "student page must expose one module script");

const N8N = "https://no3man.app.n8n.cloud/webhook";

function makeHarness({ geolocationSteps, submitResponse }) {
  const elements = new Map();
  const handlers = {};
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        style: { display: "" },
        value: "",
        textContent: "",
        innerHTML: "",
        disabled: false,
        addEventListener: (type, fn) => {
          if (type === "submit") handlers.submit = fn;
        },
      });
    }
    return elements.get(id);
  };

  const document = {
    getElementById: element,
    // Stable per-selector elements so assertions can inspect them.
    querySelector: (selector) => element(selector),
  };
  const window = { location: { search: "?s=SESSION1&t=TOKEN1", pathname: "/student-attendance.html" } };
  const history = { replaceState: () => {} };
  const storage = new Map([["dqr_device_id", "device-from-storage"]]);
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  const geoCalls = [];
  let geoIndex = 0;
  const navigator = {
    geolocation: {
      getCurrentPosition(success, failure, options) {
        geoCalls.push(options);
        const step = geolocationSteps[Math.min(geoIndex, geolocationSteps.length - 1)];
        geoIndex += 1;
        queueMicrotask(() => {
          if (step.error) failure(step.error);
          else success(step.position);
        });
      },
    },
  };

  const posts = [];
  const fetch = async (url, init) => {
    if (String(url).includes("/dqr-check")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, ticket: "ticket.payload.exp.sig", lecture: "Data Security" }) };
    }
    if (String(url).includes("/dqr-submit")) {
      posts.push({ url, body: init.body });
      return { ok: true, status: 200, json: async () => submitResponse };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const source = moduleSource.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*"\.\/location-core\.js";/,
    "const {$1} = __location;"
  );

  const run = new Function(
    "document",
    "window",
    "history",
    "localStorage",
    "navigator",
    "fetch",
    "URLSearchParams",
    "crypto",
    "console",
    "queueMicrotask",
    "setTimeout",
    "clearTimeout",
    "__location",
    source
  );
  run(
    document,
    window,
    history,
    localStorage,
    navigator,
    fetch,
    URLSearchParams,
    { randomUUID: () => "generated-device-id", getRandomValues: (a) => a },
    console,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    location
  );

  return { element, handlers, geoCalls, posts, N8N, tick: () => new Promise((resolve) => setTimeout(resolve, 0)) };
}

function fillForm(harness, overrides = {}) {
  const values = {
    name: "Test Student",
    studentId: "20230001",
    email: "student@university.edu",
    ...overrides,
  };
  for (const [id, value] of Object.entries(values)) harness.element(id).value = value;
}

test("student page submits a fresh high-accuracy reading with shared defaults", async () => {
  const harness = makeHarness({
    geolocationSteps: [
      {
        position: {
          coords: { latitude: 29.9963212, longitude: 30.96691445, accuracy: 9.6 },
          timestamp: Date.now(),
        },
      },
    ],
    submitResponse: { ok: true, locationStatus: "VERIFIED", reviewStatus: "Confirmed", distanceMeters: 42.5 },
  });

  await harness.tick(); // dqr-check
  assert.equal(harness.element("viewForm").style.display, "block");
  assert.equal(harness.element("lectureName").textContent, "Data Security");

  fillForm(harness);
  const event = { preventedDefault: false, preventDefault() { this.preventedDefault = true; } };
  await harness.handlers.submit(event);

  assert.equal(event.preventedDefault, true);
  assert.equal(harness.geoCalls.length, 1);
  assert.deepEqual(harness.geoCalls[0], {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: location.LOCATION_ACQUISITION.perReadingTimeoutMs,
  });

  assert.equal(harness.posts.length, 1);
  assert.equal(harness.posts[0].url, `${N8N}/dqr-submit`);
  const body = harness.posts[0].body;
  assert.equal(body.get("studentLatitude"), "29.9963212");
  assert.equal(body.get("studentLongitude"), "30.96691445");
  assert.equal(body.get("studentAccuracy"), "9.6");
  assert.ok(Number(body.get("studentLocationTimestamp")) > 0);
  assert.equal(body.get("deviceId"), "device-from-storage");
  assert.equal(body.get("ticket"), "ticket.payload.exp.sig");

  assert.equal(harness.element("viewSuccess").style.display, "block");
  assert.match(harness.element("locationNote").textContent, /reported accuracy ±10 m/);
  assert.match(harness.element("#viewSuccess p").innerHTML, /Reported accuracy ±10 m/);
  assert.match(harness.element("#viewSuccess p").innerHTML, /not a guarantee/);
});

test("student page retries an imprecise reading before submitting", async () => {
  const harness = makeHarness({
    geolocationSteps: [
      { position: { coords: { latitude: 29.9963212, longitude: 30.96691445, accuracy: 90 }, timestamp: Date.now() } },
      { position: { coords: { latitude: 29.9963212, longitude: 30.96691445, accuracy: 14 }, timestamp: Date.now() } },
    ],
    submitResponse: { ok: true, locationStatus: "OUTSIDE_RADIUS", reviewStatus: "Needs Review", distanceMeters: 101.6, attendanceRadiusMeters: 100 },
  });

  await harness.tick();
  fillForm(harness);
  await harness.handlers.submit({ preventDefault() {} });

  assert.equal(harness.geoCalls.length, 2);
  assert.equal(harness.posts.length, 1);
  assert.equal(harness.posts[0].body.get("studentAccuracy"), "14");
  assert.equal(harness.element("viewSuccess").style.display, "block");
  assert.match(harness.element("#viewSuccess h1").textContent, /Needs Review/);
  assert.match(harness.element("#viewSuccess p").innerHTML, /Recorded distance: 101\.6 m \(radius 100 m\)/);
  assert.match(harness.element("#viewSuccess p").innerHTML, /Reported accuracy ±14 m/);
});

test("student page blocks submission when every reading is too imprecise", async () => {
  const harness = makeHarness({
    geolocationSteps: [
      { position: { coords: { latitude: 29.9963212, longitude: 30.96691445, accuracy: 300 }, timestamp: Date.now() } },
    ],
    submitResponse: { ok: true },
  });

  await harness.tick();
  fillForm(harness);
  await harness.handlers.submit({ preventDefault() {} });

  assert.equal(harness.posts.length, 0, "no submission may be sent for an unusable reading");
  assert.equal(harness.element("formError").style.display, "block");
  assert.match(harness.element("formError").textContent, /LOW_ACCURACY/);
  assert.match(harness.element("formError").textContent, /±300 m/);
  assert.equal(harness.element("btnSubmit").disabled, false, "student can retry");
});

test("student page reports denied permission with an explicit reason", async () => {
  const harness = makeHarness({
    geolocationSteps: [{ error: { code: 1, PERMISSION_DENIED: 1 } }],
    submitResponse: { ok: true },
  });

  await harness.tick();
  fillForm(harness);
  await harness.handlers.submit({ preventDefault() {} });

  assert.equal(harness.geoCalls.length, 1, "permission denial must not be retried");
  assert.equal(harness.posts.length, 0);
  assert.match(harness.element("formError").textContent, /LOCATION_PERMISSION_DENIED/);
});

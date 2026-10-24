// ============================================================
// Dashboard render + interaction smoke test.
//
// No browser is available in this environment, so the React dashboard is
// bundled with esbuild and mounted in jsdom. This catches runtime crashes,
// missing props and broken wiring (validation, start request body, disabled
// states) on the real components — it does not replace a visual review.
// ============================================================
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "node_modules/.cache/dqr-test");
const bundlePath = path.join(outDir, "app.mjs");

let App;

before(async () => {
  // Leaflet reads `document` when its module initialises, so give the bundle a
  // DOM before importing it. Each scenario then installs its own window.
  installBaseDom();
  await mkdir(outDir, { recursive: true });
  const result = await build({
    entryPoints: [path.join(root, "src/App.tsx")],
    bundle: true,
    write: false,
    format: "esm",
    jsx: "automatic",
    target: "es2022",
    loader: { ".css": "empty", ".woff2": "empty", ".woff": "empty" },
    // Vite injects these; the test opts out of map/geocode overrides.
    define: {
      "import.meta.env": "{}",
      "process.env.NODE_ENV": JSON.stringify("development"),
    },
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    logLevel: "silent",
  });
  await writeFile(bundlePath, result.outputFiles[0].text);
  ({ default: App } = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`));
});

after(async () => {
  await rm(outDir, { recursive: true, force: true });
});

function exposeDom(window) {
  for (const name of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLButtonElement",
    "Node",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "getComputedStyle",
    "localStorage",
    "screen",
    "devicePixelRatio",
  ]) {
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
  }
}

function installBaseDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://example.test/",
    pretendToBeVisual: true,
  });
  exposeDom(dom.window);
  return dom;
}

/** Fresh jsdom per scenario; the app reads the key from the URL. */
function mount(url, { store } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url,
    pretendToBeVisual: true,
  });
  const { window } = dom;
  if (store) for (const [k, v] of Object.entries(store)) window.localStorage.setItem(k, v);

  exposeDom(window);
  return { dom, window, root: window.document.getElementById("root") };
}

async function render(container, { fetchImpl }) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input.url;
    calls.push({ url: requestUrl, method: init.method ?? "GET", body: init.body?.toString() ?? null });
    return fetchImpl(requestUrl, init);
  };

  const { createRoot } = await import("react-dom/client");
  const { createElement } = await import("react");
  const reactRoot = createRoot(container);
  reactRoot.render(createElement(App));
  await settle();
  return { calls, reactRoot };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

/** Poll instead of sleeping a fixed time: CI machines are not that fast. */
async function waitFor(predicate, label, timeout = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify(body),
  };
}

function buttonByText(document, matcher) {
  return [...document.querySelectorAll("button")].find((button) =>
    (button.textContent ?? "").toLowerCase().includes(matcher.toLowerCase()),
  );
}

const freshHall = JSON.stringify({
  latitude: 30.0444,
  longitude: 31.2357,
  confirmedAt: Date.now(),
  label: "Main auditorium",
});

test("locked console renders the key gate and never calls the workflow", async () => {
  const { window, root } = mount("https://example.test/");
  const { calls } = await render(root, {
    fetchImpl: () => {
      throw new Error("fetch must not be called without a key");
    },
  });

  const text = window.document.body.textContent;
  assert.match(text, /needs your professor key/i);
  assert.match(text, /What happens behind this gate/i);
  assert.equal(window.document.querySelectorAll("h1").length, 1, "exactly one h1 while locked");
  assert.equal(calls.length, 0);
  assert.equal(buttonByText(window.document, "Start session"), undefined);
});

test("keyed console shows the session, the hall and the blockers that stop Start", async () => {
  const { window, root } = mount("https://example.test/?key=test-key-123", { store: { dqr_lecture_location_v1: freshHall } });
  const { calls } = await render(root, {
    fetchImpl: () => jsonResponse({ ok: true, active: false }),
  });

  const { document } = window;
  assert.equal(calls[0].url, "https://no3man.app.n8n.cloud/webhook/dqr-qr?key=test-key-123");
  assert.match(document.body.textContent, /Lecture hall/i);
  assert.match(document.body.textContent, /Confirmed/i);
  assert.match(document.body.textContent, /Before you can start/i);
  assert.match(document.body.textContent, /Name the lecture/i);

  const start = buttonByText(document, "Start session");
  assert.ok(start, "start button exists");
  assert.equal(start.disabled, true, "start is blocked until the lecture is named");

  // Retype the lecture name through React's own onChange path.
  const input = document.getElementById("lecture-name");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "Data Security — Week 6");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await waitFor(() => buttonByText(document, "Start session").disabled === false, "start to unlock");
});

test("start posts the confirmed hall, then the console shows the live session", async () => {
  const { window, root } = mount("https://example.test/?key=test-key-123", { store: { dqr_lecture_location_v1: freshHall } });

  let started = false;
  const { calls } = await render(root, {
    fetchImpl: (url) => {
      if (url.includes("dqr-start")) {
        started = true;
        return jsonResponse({ ok: true, active: true, lecture: "Data Security — Week 6" });
      }
      if (url.includes("dqr-qr")) {
        return jsonResponse({
          ok: true,
          active: started,
          lecture: "Data Security — Week 6",
          sessionId: "session-1",
          token: "token-1",
          expiresInMs: 10_000,
          attendanceRadiusMeters: 100,
          locationStats: started ? { verified: 3, outsideRadius: 1, rejected: 2 } : undefined,
          lectureLocation: { latitude: 30.0444, longitude: 31.2357, source: "map", confirmedAt: Date.now() },
        });
      }
      throw new Error(`unexpected request ${url}`);
    },
  });

  const { document } = window;
  const input = document.getElementById("lecture-name");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "Data Security — Week 6");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await waitFor(() => buttonByText(document, "Start session").disabled === false, "start to unlock");

  const startBtn = buttonByText(document, "Start session");
  assert.equal(startBtn.disabled, false, "start is available before the click");
  startBtn.click();
  await waitFor(() => calls.some((call) => call.url.endsWith("dqr-start")), "the start request");

  const startCall = calls.find((call) => call.url.endsWith("dqr-start"));
  assert.ok(startCall, "start request was sent");
  assert.equal(startCall.method, "POST");
  const body = new URLSearchParams(startCall.body);
  assert.equal(body.get("instructorLocationSource"), "map");
  assert.equal(body.get("instructorLatitude"), "30.0444");
  assert.equal(body.get("instructorLongitude"), "31.2357");
  assert.equal(body.get("lecture"), "Data Security — Week 6");
  assert.ok(Number(body.get("instructorLocationConfirmedAt")) > 0);

  await waitFor(() => /Session live/i.test(document.body.textContent), "the live session state");
  const text = document.body.textContent;
  assert.match(text, /3/, "verified counter comes from the workflow payload");
  assert.match(text, /Outside the 100 m radius/i);
  assert.equal(buttonByText(document, "Start session").disabled, true, "double start is impossible");
});

test("a rejected key sends the professor back to the gate with an explanation", async () => {
  const { window, root } = mount("https://example.test/?key=wrong", { store: { dqr_lecture_location_v1: freshHall } });
  await render(root, {
    fetchImpl: () => jsonResponse({ ok: false, error: "unauthorized" }),
  });

  const text = window.document.body.textContent;
  assert.match(text, /rejected this key/i);
  assert.match(text, /needs your professor key/i);
});

test("the projector route renders the real code and falls back to the console when locked", async () => {
  const session = {
    ok: true,
    active: true,
    lecture: "Data Security — Week 6",
    sessionId: "session-1",
    token: "token-1",
    expiresInMs: 10_000,
    locationStats: { verified: 12, outsideRadius: 1, rejected: 3 },
    lectureLocation: { latitude: 30.0444, longitude: 31.2357, source: "map", confirmedAt: Date.now() },
  };

  const live = mount("https://example.test/?key=test-key-123#projector", {
    store: { dqr_lecture_location_v1: freshHall },
  });
  await render(live.root, { fetchImpl: () => jsonResponse(session) });

  const liveDoc = live.window.document;
  assert.match(liveDoc.body.textContent, /Attendance is open/i);
  assert.match(liveDoc.body.textContent, /12 verified/i);
  assert.match(liveDoc.body.textContent, /This code changes every 10 seconds/i);
  const code = liveDoc.querySelector('svg[role="img"]');
  assert.ok(code, "the projector shows a QR code with an accessible name");
  assert.match(code.getAttribute("aria-label") ?? "", /QR code for Data Security/i);
  assert.equal(liveDoc.querySelectorAll("#lecture-name").length, 0, "console controls are not in the projector view");

  const locked = mount("https://example.test/#projector");
  await render(locked.root, { fetchImpl: () => jsonResponse({ ok: true, active: false }) });
  assert.match(locked.window.document.body.textContent, /needs your professor key/i, "no projector without a key");
});

test("stopping asks for confirmation, posts once and closes attendance", async () => {
  let stopped = false;
  const { window, root } = mount("https://example.test/?key=test-key-123", { store: { dqr_lecture_location_v1: freshHall } });

  const { calls } = await render(root, {
    fetchImpl: (url) => {
      if (url.includes("dqr-stop")) {
        stopped = true;
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        ok: true,
        active: !stopped,
        lecture: "Data Security — Week 6",
        sessionId: "session-1",
        token: `token-${Date.now()}`,
        expiresInMs: 10_000,
        locationStats: { verified: 5, outsideRadius: 0, rejected: 0 },
      });
    },
  });

  const { document } = window;
  assert.match(document.body.textContent, /Session live/i);

  buttonByText(document, "Stop").click();
  await settle();
  assert.match(document.body.textContent, /End the session for everyone/i, "destructive action is confirmed");

  buttonByText(document, "Keep running").click();
  await settle();
  assert.equal(calls.some((call) => call.url.endsWith("dqr-stop")), false, "cancelling sends nothing");

  buttonByText(document, "Stop").click();
  await settle();
  buttonByText(document, "End session").click();
  await new Promise((resolve) => setTimeout(resolve, 1_800));

  assert.equal(calls.filter((call) => call.url.endsWith("dqr-stop")).length, 1, "stop is sent exactly once");
  assert.match(document.body.textContent, /Session stopped/i);
  assert.equal(document.querySelectorAll("#lecture-name").length, 1, "the lecture can be edited again");
});

test("every form control in the console has an accessible name", async () => {
  const { window, root } = mount("https://example.test/?key=test-key-123", { store: { dqr_lecture_location_v1: freshHall } });
  await render(root, { fetchImpl: () => jsonResponse({ ok: true, active: false }) });

  const { document } = window;
  const controls = [...document.querySelectorAll("input, textarea, select")];
  assert.ok(controls.length > 0);
  for (const control of controls) {
    const id = control.getAttribute("id");
    const labelled = id && document.querySelector(`label[for="${id}"]`);
    const ariaLabel = control.getAttribute("aria-label");
    assert.ok(labelled || ariaLabel, `control ${control.outerHTML.slice(0, 80)} has no accessible name`);
  }

  for (const button of document.querySelectorAll("button")) {
    const name = (button.getAttribute("aria-label") ?? button.textContent ?? "").trim();
    assert.ok(name.length > 0, `button ${button.outerHTML.slice(0, 80)} has no accessible name`);
  }

  // Heading order: one h1, and no skipped levels below it.
  const levels = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => Number(h.tagName[1]));
  assert.equal(levels.filter((level) => level === 1).length, 1, "exactly one h1 on the console");
  levels.slice(1).forEach((level, index) => {
    assert.ok(level - levels[index] <= 1, `heading level jumps from h${levels[index]} to h${level}`);
  });

  // Every labelled section resolves to a real heading.
  for (const section of document.querySelectorAll("section[aria-labelledby]")) {
    const id = section.getAttribute("aria-labelledby");
    assert.ok(document.getElementById(id), `section points at missing id ${id}`);
  }
});

test("a hall confirmed over an hour ago blocks Start and says why", async () => {
  const staleHall = JSON.stringify({
    latitude: 30.0444,
    longitude: 31.2357,
    confirmedAt: Date.now() - 61 * 60 * 1000,
    label: "Main auditorium",
  });
  const { window, root } = mount("https://example.test/?key=test-key-123", { store: { dqr_lecture_location_v1: staleHall } });
  await render(root, { fetchImpl: () => jsonResponse({ ok: true, active: false }) });

  const { document } = window;
  assert.match(document.body.textContent, /Needs reconfirming/i);
  assert.match(document.body.textContent, /older than 60 minutes/i);
  assert.equal(buttonByText(document, "Start session").disabled, true);

  const input = document.getElementById("lecture-name");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "Data Security");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await settle();
  assert.equal(buttonByText(document, "Start session").disabled, true, "a stale hall is never reused");

  // Re-confirming the same pin is one click and needs no map.
  buttonByText(document, "Confirm again at this pin").click();
  await waitFor(() => !/older than 60 minutes/i.test(document.body.textContent), "the stale warning to clear");
  assert.match(document.body.textContent, /Confirmed/i);
  await waitFor(() => buttonByText(document, "Start session").disabled === false, "start to unlock");
});

test("a key rejected at start sends the professor back to the gate", async () => {
  const { window, root } = mount("https://example.test/?key=test-key-123", { store: { dqr_lecture_location_v1: freshHall } });
  await render(root, {
    fetchImpl: (url) =>
      url.includes("dqr-start") ? jsonResponse({ ok: false, error: "unauthorized" }) : jsonResponse({ ok: true, active: false }),
  });

  const { document } = window;
  const input = document.getElementById("lecture-name");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "Data Security — Week 6");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await waitFor(() => buttonByText(document, "Start session").disabled === false, "start to unlock");
  buttonByText(document, "Start session").click();

  await waitFor(() => /needs your professor key/i.test(document.body.textContent), "the gate to return");
  assert.match(document.body.textContent, /rejected this key/i);
});

import { test, expect } from "@playwright/test";

const SNAPSHOT = {
  generatedAt: "2026-06-25T10:00:00.000Z",
  metrics: {
    activeClients: 3,
    activePairs: 1,
    recentEvents: [{
      type: "proximity:session:telemetry",
      at: "2026-06-25T10:00:00.000Z",
      detail: {
        sessionId: "prox-test",
        clientId: "android-a",
        deviceName: "Pixel 9",
        acousticEmitted: true,
        acousticDetected: true,
        acousticStartFrequencyHz: 18600,
        acousticEndFrequencyHz: 19400,
        acousticMarginDb: 9.6,
        acousticCorrelation: 0.34,
        acousticSampleRate: 48000,
        bumpCorrelation: 0.55,
        tiltMatch: 0.38
      }
    }]
  },
  signaling: {
    protocol: {
      sessionDurationMs: 3600,
      maxClients: 6,
      acousticBandStartHz: 18600,
      acousticBandEndHz: 19400,
      energyAssistedMinMarginDb: 4.5
    },
    clients: [{
      id: "iphone-a",
      deviceName: "Fuad iPhone",
      deviceFamily: "ios",
      deviceLabel: "iPhone",
      lastSeenMsAgo: 120,
      pairingId: null,
      capabilities: { microphone: true, motion: true, webRtc: true }
    }, {
      id: "android-a",
      deviceName: "Pixel 9",
      deviceFamily: "android",
      deviceLabel: null,
      lastSeenMsAgo: 220,
      pairingId: "pair-1",
      capabilities: { microphone: true, motion: true, webRtc: true }
    }, {
      id: "admin-a",
      deviceName: "WebDrop Admin",
      deviceFamily: "admin",
      lastSeenMsAgo: 20,
      capabilities: { admin: true }
    }],
    pairs: [{ pairingId: "pair-1", clientIds: ["iphone-a", "android-a"], expiresInMs: 120000 }],
    proximitySessions: [{
      id: "prox-test",
      phase: "running",
      participantCount: 2,
      participants: [{
        clientId: "android-a",
        deviceName: "Pixel 9",
        telemetry: {
          receivedAt: "2026-06-25T10:00:00.000Z",
          score: 0.66,
          decision: "verified",
          physicalEvidence: {
            bumpCorrelation: 0.55,
            tiltDegrees: 34
          },
          acoustic: {
            emitted: true,
            detected: true,
            marginDb: 9.6,
            correlation: 0.34,
            slot: 1,
            slotCount: 2,
            startFrequencyHz: 18600,
            endFrequencyHz: 19400,
            sampleRate: 48000
          }
        }
      }]
    }]
  }
};

const DEFAULT_POLICY = {
  revision: 1,
  updatedAt: null,
  scoring: {
    minimum: 55,
    weights: { sound: 34, motion: 26, bump: 20, tilt: 12, qr: 8 }
  },
  timing: { lateTapGraceMs: 6000, acousticWindowMs: 6000, matchSlopMs: 4000 }
};

// Rich multi-device snapshot: two concurrent sessions (a running 2-phone verify and
// a 3-phone joining lobby) plus finished matched/failed sessions reconstructed from
// the event feed. Exercises slot labels, acoustic margins, per-evidence flags,
// phase badges, and the recent-session backfill that used to report "0 phones".
function multiDeviceSnapshot() {
  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
  return {
    generatedAt: iso(0),
    metrics: {
      activeClients: 4,
      activePairs: 1,
      recentEvents: [
        { type: "proximity:session:telemetry", at: iso(-30000), detail: { sessionId: "prox-done-1", clientId: "iphone-x", deviceName: "Mahdi iPhone 15", score: 0.72, acousticEmitted: true, acousticDetected: true, acousticSlot: 0, acousticSlotCount: 2, acousticStartFrequencyHz: 18600, acousticEndFrequencyHz: 19400, acousticMarginDb: 9.1, acousticCorrelation: 0.41, acousticRecordingPeak: 0.12, acousticDetectionMethod: "slot-correlation" } },
        { type: "proximity:session:telemetry", at: iso(-29500), detail: { sessionId: "prox-done-1", clientId: "pixel-y", deviceName: "Pixel 9 Pro", score: 0.69, acousticEmitted: true, acousticDetected: true, acousticSlot: 1, acousticSlotCount: 2, acousticStartFrequencyHz: 18600, acousticEndFrequencyHz: 19400, acousticMarginDb: 7.4, acousticCorrelation: 0.33, acousticRecordingPeak: 0.09, acousticDetectionMethod: "slot-correlation" } },
        { type: "proximity:session:matched", at: iso(-29000), detail: { sessionId: "prox-done-1", score: 0.69, clientIds: ["iphone-x", "pixel-y"] } },
        { type: "proximity:session:failed", at: iso(-60000), detail: { sessionId: "prox-done-2", clientId: "galaxy-z", deviceName: "Galaxy S24", reason: "acoustic_not_detected", score: 0.32, acousticSlot: 0, acousticSlotCount: 2, acousticEmitted: true, acousticDetected: false, acousticCorrelation: 0.04 } }
      ]
    },
    signaling: {
      protocol: {
        joinWindowMs: 1800, startDelayMs: 1200, sessionDurationMs: 3600, sessionTtlMs: 15000,
        scoreMinimum: 0.55, maxClients: 6, acousticBandStartHz: 18600, acousticBandEndHz: 19400,
        acousticSlotCorrelationMin: 0.2, energyAssistedMinMarginDb: 4.5
      },
      clients: [
        { id: "iphone-x", deviceName: "Mahdi iPhone 15", deviceFamily: "ios", deviceLabel: "iPhone", lastSeenMsAgo: 120, pairingId: "pair-1", capabilities: { microphone: true, motion: true, webRtc: true } },
        { id: "pixel-y", deviceName: "Pixel 9 Pro", deviceFamily: "android", deviceLabel: null, lastSeenMsAgo: 240, pairingId: "pair-1", capabilities: { microphone: true, motion: true, webRtc: true } },
        { id: "galaxy-z", deviceName: "Galaxy S24", deviceFamily: "android", deviceLabel: null, lastSeenMsAgo: 500, pairingId: null, capabilities: { microphone: true, motion: true, webRtc: true } },
        { id: "admin-a", deviceName: "WebDrop Admin", deviceFamily: "admin", lastSeenMsAgo: 20, capabilities: { admin: true } }
      ],
      pairs: [{ pairingId: "pair-1", clientIds: ["iphone-x", "pixel-y"], expiresInMs: 540000 }],
      proximitySessions: [
        {
          id: "prox-3f9a2b7c-1d4e-4a8b-9c0d-112233445566",
          phase: "running",
          participantCount: 2,
          createdAt: iso(-5000),
          startAt: now - 3000,
          endsAt: now + 60000,
          participants: [
            {
              clientId: "iphone-x", deviceName: "Mahdi iPhone 15",
              acousticCapabilities: { sampleRate: 48000, microphoneReady: true },
              signature: { slot: 1, startFrequencyHz: 18600, endFrequencyHz: 19400 },
              telemetry: {
                receivedAt: iso(-2000), score: 0.66, decision: "verified",
                physicalEvidence: { ultrasound: true, bump: true, tilt: true },
                acoustic: { emitted: true, detected: true, slot: 0, slotCount: 2, startFrequencyHz: 18600, endFrequencyHz: 19400, marginDb: 9.6, detectionMethod: "slot-correlation", sampleRate: 48000 }
              }
            },
            {
              clientId: "pixel-y", deviceName: "Pixel 9 Pro",
              acousticCapabilities: { sampleRate: 44100, microphoneReady: true },
              signature: { slot: 2, startFrequencyHz: 18600, endFrequencyHz: 19400 },
              telemetry: {
                receivedAt: iso(-1800), score: 0.61, decision: "verified",
                physicalEvidence: { ultrasound: true, bump: true, tilt: false },
                acoustic: { emitted: true, detected: true, slot: 1, slotCount: 2, startFrequencyHz: 18600, endFrequencyHz: 19400, marginDb: 6.8, detectionMethod: "energy-assisted", sampleRate: 44100 }
              }
            }
          ]
        },
        {
          id: "prox-99887766-5544-4332-2110-abcdefabcdef",
          phase: "joining",
          participantCount: 3,
          createdAt: iso(-1200),
          startAt: null,
          endsAt: null,
          participants: [
            { clientId: "galaxy-z", deviceName: "Galaxy S24", acousticCapabilities: { sampleRate: 48000, microphoneReady: false }, signature: null, telemetry: null },
            { clientId: "iphone-q", deviceName: "Spare iPhone", acousticCapabilities: { sampleRate: 48000, microphoneReady: true }, signature: null, telemetry: null },
            { clientId: "pixel-w", deviceName: "Pixel Tablet", acousticCapabilities: { sampleRate: 44100, microphoneReady: false }, signature: null, telemetry: null }
          ]
        }
      ]
    }
  };
}

test.beforeEach(async ({ page }) => {
  await installRuntimeMocks(page);
});

test("redesigns admin readiness around truthful launch state", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Admin operations shell is covered once in Chromium.");
  const consoleProblems = collectConsoleProblems(page);

  await page.goto("/admin/?qa=e2e-admin-redesign", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "What is actually ready" })).toBeVisible();
  await expect(page.locator("[data-admin-tab]")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Readiness" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Live testing" })).toBeVisible();
  await expect(page.getByText("Back to app")).toHaveCount(0);
  await expect(page.getByText("Open live diagnostics")).toHaveCount(0);
  await expect(page.locator("[data-readiness-board]")).toContainText("Production signaling");
  await expect(page.locator("[data-readiness-board]")).toContainText("TURN credentials");
  await expect(page.locator("[data-readiness-board]")).toContainText("Proximity ceremony");
  await expect(page.locator("[data-readiness-board]")).toContainText("Needs physical proof");
  await expect(page.locator("[data-readiness-board]")).toContainText("No production infrastructure blocker");
  await expect(page.locator("[data-summary-devices]")).toHaveText("2");
  await expect(page.locator("[data-summary-pairs]")).toHaveText("1");
  await expect(page.locator("[data-summary-readiness]")).toHaveText("56%");
  await expect(page.locator("[data-readiness-score]")).toHaveText("56%");
  await expect(page.locator("[data-readiness-explainer]")).toContainText("5 of 9");

  await expect(page.locator('[data-readiness-board] [data-state="ready"] .readiness-row span').first()).toHaveText("Live");
  await expect(page.locator('[data-readiness-board] [data-state="proof"] .readiness-row span').first()).toHaveText("1-on-1 verified");

  await page.locator("[data-operations-language]").selectOption("ja");
  await expect(page.getByRole("heading", { name: "実際に準備できているもの" })).toBeVisible();
  await expect(page.locator("[data-readiness-board]")).toContainText("近接セレモニー");
  await expect(page.locator("[data-readiness-board]")).toContainText("実機証明が必要");
  await expect(page.locator('[data-readiness-board] [data-state="ready"] .readiness-row span').first()).toHaveText("稼働中");
  await expect(page.locator('[data-readiness-board] [data-state="proof"] .readiness-row span').first()).toHaveText("1対1で確認済み");
  expect(consoleProblems()).toEqual([]);
});

test("uses a visible admin token form when modal prompts are unavailable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Admin authentication is covered once in Chromium.");
  const consoleProblems = collectConsoleProblems(page);
  let snapshotRequests = 0;
  await page.addInitScript(() => {
    globalThis.__webdropPromptCalls = 0;
    globalThis.prompt = () => {
      globalThis.__webdropPromptCalls += 1;
      throw new Error("prompt() is not supported");
    };
  });
  await page.route("**/js/config/local-admin-token.js*", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: "/* no local token */" });
  });
  await page.route("https://signal.test/api/diagnostics-public", async (route) => {
    snapshotRequests += 1;
    if (route.request().headers().authorization !== "Bearer e2e-manual-token") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "unauthorized" })
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(SNAPSHOT) });
  });

  await page.goto("/admin/?tab=live&qa=visible-admin-access", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-admin-access]")).toBeVisible();
  await expect(page.locator("[data-admin-token-input]")).toBeVisible();
  await expect(page.locator("[data-device-list]")).toContainText("No physical devices are connected");
  expect(snapshotRequests).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.locator("[data-admin-token-input]").fill("e2e-manual-token");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.locator("[data-admin-access]")).toBeHidden();
  await expect(page.locator("[data-device-list]")).toContainText("Fuad iPhone");
  await expect(page.locator("[data-summary-devices]")).toHaveText("2");
  await expect.poll(() => snapshotRequests).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => globalThis.__webdropPromptCalls)).toBe(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("webdrop.adminToken"))).toBe("e2e-manual-token");
  expect(consoleProblems()).toEqual([]);
});

test("updates proximity tuning and records a repeatable test case", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Admin tuning and test recorder are covered once in Chromium.");
  const consoleProblems = collectConsoleProblems(page);
  await page.goto("/admin/?tab=settings", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Proximity tuning" })).toBeVisible();
  await expect(page.locator('[data-policy-weight="bump"]')).toHaveValue("20");
  await expect(page.locator('[data-policy-weight="tilt"]')).toHaveValue("12");
  await expect(page.locator('[data-policy-timing="lateTapGraceMs"]')).toHaveValue("6000");

  await page.locator('[data-policy-weight="sound"]').fill("30");
  await page.locator('[data-policy-weight="motion"]').fill("22");
  await page.locator('[data-policy-weight="bump"]').fill("25");
  await page.locator('[data-policy-weight="tilt"]').fill("15");
  await expect(page.locator("[data-policy-weight-total]")).toHaveText("100 points");
  await page.getByRole("button", { name: "Save & apply" }).click();
  await expect(page.locator("[data-policy-status]")).toContainText("Applied revision 2");

  await page.getByRole("button", { name: "Test cases" }).click();
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
  await page.locator('[data-test-device-assignment="iphone-a"]').selectOption("A");
  await page.locator('[data-test-device-assignment="android-a"]').selectOption("A");
  await expect(page.locator("[data-assignment-status]")).toHaveText("Assignments ready.");
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.locator("[data-run-status-copy]")).toHaveText("Recording");
  await expect(page.locator("[data-active-run-summary]")).toContainText("Revision 2");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator("[data-run-history]")).toContainText("Top edge to top edge");
  expect(consoleProblems()).toEqual([]);
});

test("keeps public server health online when private diagnostics are unreachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Admin operations shell is covered once in Chromium.");
  await page.route("https://signal.test/api/diagnostics-public", (route) => route.abort());

  await page.goto("/admin/?tab=readiness", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-summary-server]")).toHaveText("Connected");
  await expect(page.locator("[data-readiness-board]")).toContainText("Production signaling");
  await expect(page.locator("[data-summary-readiness]")).toHaveText("56%");

  await page.locator("[data-operations-language]").selectOption("ja");
  await expect(page.locator("[data-summary-server]")).toHaveText("接続済み");
  await expect(page.locator("[data-readiness-board]")).toContainText("本番シグナリング");
});

test("folds old diagnostics into live testing and monitors a selected device", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Live testing console is covered once in Chromium.");
  const consoleProblems = collectConsoleProblems(page);

  await page.goto("/admin/diagnostics.html?qa=e2e-diagnostics-redirect", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/\?tab=live/);
  await expect(page.getByRole("heading", { name: "Live testing" })).toBeVisible();
  await expect(page.getByText("Ultrasonic audio lab")).toHaveCount(0);
  await expect(page.locator("[data-device-list]")).toContainText("Fuad iPhone");
  await expect(page.locator("[data-device-list]")).toContainText("Pixel 9");
  await expect(page.locator("[data-device-list]")).toContainText("Android");

  await page.locator("[data-monitor-device]").selectOption("android-a");
  await page.locator("[data-action='monitor-start']").click();
  await expect(page.locator("[data-monitor-status-copy]")).toHaveText("Active");
  await expect(page.locator("[data-monitor-metrics]")).toContainText("Emitted packet");
  await expect(page.locator("[data-monitor-metrics]")).toContainText("48 kHz");
  await expect(page.locator("[data-monitor-metrics]")).toContainText("+20 (raw 16.8)");
  await expect(page.locator("[data-monitor-metrics]")).toContainText("34°");
  await expect(page.locator("[data-frequency-channels] .frequency-channel")).toHaveCount(4);
  await expect(page.locator("[data-frequency-channels]")).toContainText("18 kHz");
  await expect(page.locator("[data-frequency-channels]")).toContainText("19 kHz");
  await expect(page.locator("[data-frequency-channels]")).toContainText("-42.0 dB");
  await expect(page.locator("[data-frequency-channels]")).toContainText("Signal");
  await expect(page.locator("[data-event-timeline]")).toContainText("monitor telemetry");
  await expect(page.locator("[data-session-count]")).toHaveText("1 active");

  await page.locator("[data-action='monitor-stop']").click();
  await expect(page.locator("[data-monitor-status-copy]")).toHaveText("Idle");

  await page.locator("[data-action='monitor-start-all']").click();
  await expect(page.locator("[data-action='monitor-start-all']")).toBeDisabled();
  await expect(page.locator("[data-action='monitor-stop-all']")).toBeEnabled();
  await expect(page.locator("[data-device-list]")).toContainText("Active");
  await page.locator("[data-action='monitor-stop-all']").click();
  await expect(page.locator("[data-action='monitor-stop-all']")).toBeDisabled();
  expect(consoleProblems()).toEqual([]);
});

test("renders the current two-device comparison with reciprocal evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Two-device comparison is covered once in Chromium.");
  const consoleProblems = collectConsoleProblems(page);
  await page.route("https://signal.test/api/diagnostics-public", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(multiDeviceSnapshot()) });
  });

  await page.goto("/admin/?tab=live", { waitUntil: "domcontentloaded" });
  await page.locator("[data-multi-a]").selectOption("iphone-x");
  await page.locator("[data-multi-b]").selectOption("pixel-y");
  await expect(page.locator("[data-multi-column-a]")).toContainText("Mahdi iPhone 15");
  await expect(page.locator("[data-multi-column-b]")).toContainText("Pixel 9 Pro");
  await expect(page.locator("[data-multi-column-a]")).toContainText("Heard signal");
  await expect(page.locator("[data-multi-column-a]")).toContainText("9.6 dB");
  await expect(page.locator("[data-multi-outcome] .pairing-outcome")).toHaveAttribute("data-outcome", "pass");
  await expect(page.locator("[data-multi-outcome]")).toContainText("Reciprocal heard: Yes");
  await expect(page.locator("[data-multi-outcome]")).toContainText("Verified");

  // Matched events render a friendly summary, never raw JSON, in the timeline.
  const timeline = page.locator("[data-event-timeline]");
  await expect(timeline).toContainText("session matched");
  await expect(timeline).not.toContainText('"sessionId"');

  await page.locator(".multi-section").screenshot({ path: testInfo.outputPath("admin-two-device.png") });
  await testInfo.attach("admin-two-device", { path: testInfo.outputPath("admin-two-device.png"), contentType: "image/png" });

  // The same comparison remains legible after localisation.
  await page.locator("[data-operations-language]").selectOption("ja");
  await expect(page.locator("[data-multi-outcome]")).toContainText("相互受信: はい");
  await expect(page.locator("[data-multi-column-a]")).toContainText("Mahdi iPhone 15");

  expect(consoleProblems()).toEqual([]);
});

async function installRuntimeMocks(page) {
  let policy = structuredClone(DEFAULT_POLICY);
  await page.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) {
        super();
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          this.dispatchMessage({ type: "server:ready" });
        }, 0);
      }

      send(raw) {
        const message = JSON.parse(raw);
        if (message.type === "client:hello") {
          this.dispatchMessage({ type: "connected", mode: "wss", id: "admin-a", sessionId: "session-admin" });
        }
        if (message.type === "admin:monitor:start") {
          setTimeout(() => {
            this.dispatchMessage({
              type: "admin:monitor:started",
              payload: {
                monitorId: message.payload.monitorId,
                targetId: message.targetId,
                deviceName: "Pixel 9"
              }
            });
            this.dispatchMessage({
              type: "admin:monitor:telemetry",
              payload: {
                monitorId: message.payload.monitorId,
                targetId: message.targetId,
                deviceId: message.targetId,
                deviceName: "Pixel 9",
                deviceFamily: "android",
                status: "active",
                reason: null,
                sequence: 1,
                sampledAt: Date.now(),
                contextState: "running",
                sampleRate: 48000,
                emitted: true,
                detected: true,
                startFrequencyHz: 18600,
                endFrequencyHz: 19400,
                peakDb: -42,
                noiseDb: -51.4,
                marginDb: 9.4,
                confidence: 0.42,
                bumpDetected: true,
                bumpPoints: 20,
                tiltDetected: true,
                tiltDegrees: 34,
                motionSamples: 72,
                maxAcceleration: 16.8,
                bands: [{
                  startFrequencyHz: 18000,
                  endFrequencyHz: 18500,
                  detected: false,
                  peakDb: -81,
                  noiseDb: -91,
                  marginDb: 10,
                  confidence: 0.12
                }, {
                  startFrequencyHz: 18500,
                  endFrequencyHz: 19500,
                  detected: true,
                  peakDb: -42,
                  noiseDb: -51.4,
                  marginDb: 9.4,
                  confidence: 0.42
                }, {
                  startFrequencyHz: 19500,
                  endFrequencyHz: 20500,
                  detected: false,
                  peakDb: -77,
                  noiseDb: -89,
                  marginDb: 12,
                  confidence: 0.16
                }, {
                  startFrequencyHz: 20500,
                  endFrequencyHz: 21000,
                  detected: false,
                  peakDb: -92,
                  noiseDb: -95,
                  marginDb: 3,
                  confidence: 0
                }]
              }
            });
          }, 0);
        }
        if (message.type === "admin:monitor:stop") {
          setTimeout(() => {
            this.dispatchMessage({
              type: "admin:monitor:stopped",
              payload: {
                monitorId: message.payload.monitorId,
                targetId: message.targetId
              }
            });
            this.dispatchMessage({
              type: "admin:monitor:telemetry",
              payload: {
                monitorId: message.payload.monitorId,
                targetId: message.targetId,
                deviceId: message.targetId,
                deviceName: "Pixel 9",
                deviceFamily: "android",
                status: "active",
                sequence: 99,
                emitted: true,
                detected: true,
                confidence: 0.99,
                marginDb: 30,
                bands: [{
                  startFrequencyHz: 18500,
                  endFrequencyHz: 19500,
                  detected: true,
                  peakDb: -10,
                  noiseDb: -40,
                  marginDb: 30,
                  confidence: 0.99
                }]
              }
            });
          }, 0);
        }
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.dispatchEvent(new Event("close"));
      }

      dispatchMessage(payload) {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
      }
    }
    window.WebSocket = MockWebSocket;
  });

  await page.route("**/js/config/runtime-config.js*", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `globalThis.WEBDROP_RUNTIME_CONFIG = Object.freeze({
        productionSignaling: true,
        signalingUrl: "wss://signal.test/ws",
        turnConfigUrl: "https://signal.test/api/ice-servers"
      });`
    });
  });
  // Deterministic local operations token so the dashboard does not depend on the
  // gitignored js/config/local-admin-token.js being present on disk.
  await page.route("**/js/config/local-admin-token.js*", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `globalThis.WEBDROP_ADMIN_TOKEN = "e2e-operations-token";`
    });
  });
  await page.route("https://signal.test/readyz", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, environment: "production", turnConfigured: true })
    });
  });
  await page.route("https://signal.test/api/diagnostics-public", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(SNAPSHOT)
    });
  });
  await page.route("https://signal.test/api/proximity-policy", async (route) => {
    if (route.request().method() === "PUT") {
      const update = route.request().postDataJSON();
      policy = {
        ...policy,
        ...update,
        revision: policy.revision + 1,
        updatedAt: new Date().toISOString(),
        scoring: { ...policy.scoring, ...update.scoring, weights: { ...policy.scoring.weights, ...update.scoring?.weights } },
        timing: { ...policy.timing, ...update.timing }
      };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, policy }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ tuning: policy, proximity: { enabled: true } })
    });
  });
}

function collectConsoleProblems(page) {
  const consoleProblems = [];
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });
  return () => consoleProblems;
}

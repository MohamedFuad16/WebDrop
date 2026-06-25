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

test.beforeEach(async ({ page }) => {
  await installRuntimeMocks(page);
});

test("redesigns admin readiness around truthful launch state", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Admin operations shell is covered once in Chromium.");
  const consoleProblems = collectConsoleProblems(page);

  await page.goto("/admin/?qa=e2e-admin-redesign", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "What is actually ready" })).toBeVisible();
  await expect(page.locator("[data-admin-tab]")).toHaveCount(2);
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

  await page.locator("[data-operations-language]").selectOption("ja");
  await expect(page.getByRole("heading", { name: "実際に準備できているもの" })).toBeVisible();
  await expect(page.locator("[data-readiness-board]")).toContainText("近接セレモニー");
  await expect(page.locator("[data-readiness-board]")).toContainText("実機証明が必要");
  expect(consoleProblems()).toEqual([]);
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
  await expect(page.locator("[data-monitor-metrics]")).toContainText("Heard signal");
  await expect(page.locator("[data-monitor-metrics]")).toContainText("42% · Yes");
  await expect(page.locator("[data-monitor-metrics]")).toContainText("9.4 dB");
  await expect(page.locator("[data-monitor-metrics]")).toContainText("48 kHz");
  await expect(page.locator("[data-event-timeline]")).toContainText("monitor telemetry");
  await expect(page.locator("[data-session-table]")).toContainText("prox-test");

  await page.locator("[data-action='monitor-stop']").click();
  await expect(page.locator("[data-monitor-status-copy]")).toHaveText("Idle");
  expect(consoleProblems()).toEqual([]);
});

async function installRuntimeMocks(page) {
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
              monitorId: message.payload.monitorId,
              targetId: message.targetId,
              deviceName: "Pixel 9"
            });
            this.dispatchMessage({
              type: "admin:monitor:telemetry",
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
              confidence: 0.42
            });
          }, 0);
        }
        if (message.type === "admin:monitor:stop") {
          setTimeout(() => {
            this.dispatchMessage({
              type: "admin:monitor:stopped",
              monitorId: message.payload.monitorId,
              targetId: message.targetId
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
}

function collectConsoleProblems(page) {
  const consoleProblems = [];
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });
  return () => consoleProblems;
}

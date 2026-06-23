import { test, expect } from "@playwright/test";

test("renders live signaling and ultrasonic diagnostics", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Diagnostics control room is covered once in Chromium.");
  const consoleProblems = [];
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
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
      body: JSON.stringify({
        ok: true,
        environment: "production",
        turnConfigured: true
      })
    });
  });
  await page.route("https://signal.test/api/diagnostics-snapshot", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: "2026-06-19T10:00:00.000Z",
        metrics: {
          activeClients: 2,
          activePairs: 0,
          recentEvents: [{
            type: "proximity:session:telemetry",
            at: "2026-06-19T10:00:00.000Z",
            detail: {
              clientId: "iphone-a",
              acousticEmitted: true,
              acousticDetected: false
            }
          }]
        },
        signaling: {
          clients: [{
            id: "iphone-a",
            deviceName: "Fuad iPhone",
            deviceFamily: "ios",
            deviceLabel: "iPhone",
            lastSeenMsAgo: 120,
            pairingId: null,
            capabilities: { microphone: true, motion: true, webRtc: true }
          }],
          pairs: [],
          proximitySessions: [{
            id: "prox-test",
            phase: "running",
            participantCount: 2,
            participants: [{
              clientId: "iphone-a",
              deviceName: "Fuad iPhone",
              signature: {
                slot: 1,
                startFrequencyHz: 18600,
                endFrequencyHz: 18820
              },
              telemetry: {
                score: 0.46,
                decision: "insufficient",
                acoustic: {
                  emitted: true,
                  detected: false,
                  marginDb: 2.4
                }
              }
            }]
          }]
        }
      })
    });
  });

  await page.goto("/admin/diagnostics.html?qa=e2e-diagnostics", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Live proximity diagnostics" })).toBeVisible();
  await expect(page.locator("[data-server-status]")).toHaveText("Connected");
  await expect(page.locator("[data-device-count]")).toHaveText("1");
  await expect(page.locator("[data-device-rows]")).toContainText("Fuad iPhone");
  await expect(page.locator("[data-session-list]")).toContainText("prox-test");
  await expect(page.locator("[data-session-list]")).toContainText("emitted yes");
  await expect(page.locator("[data-session-list]")).toContainText("detected no");
  await expect(page.locator("[data-event-stream]")).toContainText("proximity:session:telemetry");
  await expect(page.locator("[data-acoustic-canvas]")).toBeVisible();
  await expect(page.locator("[data-action='acoustic-loopback']")).toBeVisible();
  expect(consoleProblems).toEqual([]);
});

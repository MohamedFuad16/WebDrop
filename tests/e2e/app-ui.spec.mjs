import { expect, test } from "@playwright/test";

const demoRuntime = `
globalThis.WEBDROP_RUNTIME_CONFIG = Object.freeze({
  productionSignaling: false,
  realProximityCeremony: false,
  realTransfer: false,
  qrPairing: false,
  signalingUrl: "",
  turnConfigUrl: ""
});
`;

test.beforeEach(async ({ page }) => {
  await page.route("**/js/config/runtime-config.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: demoRuntime
    });
  });
});

function isIgnorableBrowserNoise(text) {
  return (
    text.includes("GL Driver Message") ||
    text.includes("GPU stall due to ReadPixels") ||
    text.includes("CONTEXT_LOST_WEBGL") ||
    text.includes("Failed to load resource: net::ERR_CONNECTION_RESET") ||
    text.includes("Failed to load resource: net::ERR_SOCKET_NOT_CONNECTED")
  );
}

test("loads the WebDrop shell, receive UI, and deferred storage copy", async ({ page }) => {
  const consoleProblems = [];
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const text = message.text();
    if (!isIgnorableBrowserNoise(text)) consoleProblems.push(text);
  });

  await page.goto("/?qa=e2e-ui&runtime=mock", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#app")).toHaveAttribute("data-mode", "lobby");
  await expect(page.locator(".brand-lockup strong")).toHaveText("WebDrop");
  await expect(page.locator("[data-receive-sheet]")).toBeAttached();
  await expect(page.locator("[data-i18n='appInfoStackCopy']")).toContainText("deferred IndexedDB receive storage");
  await expect(page.locator("[data-i18n='appInfoFilesCopy']")).toContainText("saved by the receiving browser");

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    receiveBadgeHidden: document.querySelector("[data-receive-badge]")?.hidden ?? null,
    streamModulePreload: Boolean(document.querySelector("script[src*='js/app.js']"))
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.receiveBadgeHidden).toBe(true);
  expect(layout.streamModulePreload).toBe(true);
  expect(consoleProblems).toEqual([]);
});

test("keeps paused orbit peers centered on their rings without collisions", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("webdrop.motionPaused", "true");
  });
  await page.goto("/?qa=e2e-orbit-geometry&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });
  await expect(page.locator(".peer-node")).toHaveCount(12);

  const geometry = await page.evaluate(() => {
    const scene = document.querySelector(".orbit-scene").getBoundingClientRect();
    const ringRadii = ["one", "two", "three", "four"].map((name) =>
      document.querySelector(`.orbit-ring--${name}`).getBoundingClientRect().width / 2
    );
    const center = {
      x: scene.left + scene.width / 2,
      y: scene.top + scene.height / 2
    };
    const peers = [...document.querySelectorAll(".peer-node")].map((node) => {
      const rect = node.querySelector(".peer-avatar").getBoundingClientRect();
      const peerCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      return {
        ring: Number(node.dataset.ringIndex),
        x: peerCenter.x,
        y: peerCenter.y,
        size: Math.max(rect.width, rect.height),
        centerDistance: Math.hypot(peerCenter.x - center.x, peerCenter.y - center.y)
      };
    });
    let minimumClearance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < peers.length; index += 1) {
      for (let other = index + 1; other < peers.length; other += 1) {
        const first = peers[index];
        const second = peers[other];
        const centerDistance = Math.hypot(first.x - second.x, first.y - second.y);
        const clearance = centerDistance - (first.size + second.size) / 2;
        minimumClearance = Math.min(minimumClearance, clearance);
      }
    }
    return {
      minimumClearance,
      radiusErrors: peers.map((peer) => Math.abs(peer.centerDistance - ringRadii[peer.ring]))
    };
  });

  expect(geometry.minimumClearance).toBeGreaterThanOrEqual(8);
  expect(Math.max(...geometry.radiusErrors)).toBeLessThanOrEqual(1.5);
});

test("imports the StreamSaver adapter in a real browser context", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Streaming adapter browser import is validated in Chromium.");

  await page.goto("/tests/e2e/blank.html?qa=e2e-stream-adapter", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const module = await import("/js/vendor/streamsaver-adapter.js?v=e2e");
    return {
      hasAdapter: typeof module.createStreamSaverAdapter().createWriteStream === "function",
      supported: module.isStreamSaverSupported()
    };
  });

  expect(result.hasAdapter).toBe(true);
  expect(result.supported).toBe(true);
});

test("uses deferred Blob receive storage on iPhone WebKit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-iphone-15-pro", "iPhone Safari fallback is WebKit-specific.");

  await page.goto("/tests/e2e/blank.html?qa=e2e-webkit-storage", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const { StorageClient } = await import("/js/storage/storage-client.js?v=e2e-webkit-storage");
    const storage = new StorageClient(null, {
      enabled: true,
      streamSaver: {
        createWriteStream() {
          throw new Error("StreamSaver must not be selected on iPhone Safari.");
        }
      }
    });
    return storage.prepareSession({ id: "webkit-rx", expectedBytes: 1024 });
  });

  expect(result.backend).toBe("blob");
});

test("defers desktop receive chunks in IndexedDB until Save", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Deferred IndexedDB streaming is validated on desktop Chromium.");

  await page.goto("/tests/e2e/blank.html?qa=e2e-deferred-storage", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const { StorageClient } = await import("/js/storage/storage-client.js?v=e2e-deferred-storage");
    const writes = [];
    let streamCreations = 0;
    let closes = 0;
    const storage = new StorageClient(null, {
      enabled: true,
      streamSaver: {
        createWriteStream() {
          streamCreations += 1;
          return new WritableStream({
            write(chunk) {
              writes.push(chunk.byteLength);
            },
            close() {
              closes += 1;
            }
          });
        }
      }
    });
    const session = await storage.prepareSession({ id: "deferred-rx", expectedBytes: 11 });
    await storage.prepareFile({
      id: "file-1",
      name: "deferred.txt",
      type: "text/plain",
      size: 11
    }, { sessionId: "deferred-rx" });
    await storage.writeChunk(new TextEncoder().encode("hello "), {
      sessionId: "deferred-rx",
      fileId: "file-1",
      index: 0,
      byteLength: 6
    });
    await storage.writeChunk(new TextEncoder().encode("world"), {
      sessionId: "deferred-rx",
      fileId: "file-1",
      index: 1,
      byteLength: 5
    });
    const finalized = await storage.finalize({ sessionId: "deferred-rx" });
    const beforeSave = { streamCreations, writes: [...writes], closes };
    const exported = await storage.exportFile("file-1", { sessionId: "deferred-rx" });
    await storage.cleanup({ sessionId: "deferred-rx" });
    return {
      sessionBackend: session.backend,
      finalizedBackend: finalized.backend,
      canSave: finalized.files[0].canSave,
      beforeSave,
      afterSave: { streamCreations, writes, closes },
      exportedOpenUnavailable: exported.openUnavailable
    };
  });

  expect(result).toEqual({
    sessionBackend: "indexeddb-deferred",
    finalizedBackend: "indexeddb-deferred",
    canSave: true,
    beforeSave: { streamCreations: 0, writes: [], closes: 0 },
    afterSave: { streamCreations: 1, writes: [6, 5], closes: 1 },
    exportedOpenUnavailable: true
  });
});

test("admin readiness probe calls the public readiness endpoint", async ({ page }) => {
  let readinessRequest = null;
  await page.route("https://signal.example.test/readyz", async (route) => {
    readinessRequest = {
      method: route.request().method(),
      authorization: await route.request().headerValue("authorization")
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        service: "webdrop-signaling",
        turnConfigured: true
      })
    });
  });

  await page.goto("/admin/?qa=e2e-readyz", { waitUntil: "domcontentloaded" });
  await page.locator("[data-admin-tab='live']").click();
  await page.locator("[data-http-base]").fill("https://signal.example.test");
  await page.locator("[data-bearer-token]").fill("must-not-leak");
  await page.locator("[data-action='probe-ready']").click();

  await expect(page.locator("[data-api-output]")).toContainText('"status": 200');
  await expect(page.locator("[data-api-output]")).toContainText('"turnConfigured": true');
  expect(readinessRequest).toEqual({
    method: "GET",
    authorization: null
  });
});

test("falls back when production-like peers omit avatar or text fields", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/tests/e2e/blank.html?qa=e2e-fallback-helpers", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const module = await import("/js/ui/app-view.js?v=e2e-fallback");
    return {
      escaped: module.__appViewTest.escapeHtml(undefined),
      avatarMarkup: module.__appViewTest.staticAvatarMarkup(undefined)
    };
  });

  expect(result.escaped).toBe("");
  expect(result.avatarMarkup).toContain("assets/icons/avatars/user-01.png");
  expect(pageErrors).toEqual([]);
});

test("shows an honest offline state when production signaling cannot connect", async ({ page }) => {
  await page.unroute("**/js/config/runtime-config.js*");
  await page.route("**/js/config/runtime-config.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `globalThis.WEBDROP_RUNTIME_CONFIG = Object.freeze({
        productionSignaling: true,
        realProximityCeremony: false,
        realTransfer: true,
        qrPairing: false,
        signalingUrl: "ws://127.0.0.1:65534/ws",
        turnConfigUrl: "http://127.0.0.1:65534/api/ice-servers"
      });`
    });
  });

  await page.goto("/?qa=e2e-signaling-offline", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("[data-connection-label]")).toHaveText("Nearby service unavailable", {
    timeout: 10_000
  });
  await expect(page.locator(".peer-node")).toHaveCount(0);
});

test("connects from the global proximity button, selects a file, and shows Dynamic Island transfer progress", async ({ page }) => {
  const consoleProblems = [];
  let downloadCount = 0;
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("download", () => {
    downloadCount += 1;
  });
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const text = message.text();
    if (!isIgnorableBrowserNoise(text)) consoleProblems.push(text);
  });

  await page.addInitScript(() => {
    localStorage.setItem("webdrop.motionPaused", "true");
  });
  await page.goto("/?qa=e2e-transfer-island&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });
  await expect(page.locator('[data-action="connect-nearby"]')).toBeVisible({ timeout: 7000 });
  await expect(page.locator('[data-action="connect-qr"]')).toBeVisible({ timeout: 7000 });
  await expect(page.locator(".peer-node").first()).toBeVisible({ timeout: 7000 });
  await expect(page.locator(".peer-node button")).toHaveCount(0);
  await page.locator('[data-action="connect-qr"]').click();
  await expect(page.locator("[data-peer-sheet]")).toBeVisible();
  await expect(page.locator("[data-sheet-peer-name]")).toContainText("Aki iPhone");
  await page.locator("[data-peer-sheet] [data-action='close-sheet']").click();
  await expect(page.locator("[data-peer-sheet]")).toBeHidden();
  await page.locator('[data-action="connect-nearby"]').click();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 7000 });
  await page.waitForTimeout(300);
  expect(downloadCount).toBe(0);
  await page.locator('[data-action="open-receive-sheet"]').click();
  await expect(page.locator("[data-received-list] button").first()).toHaveText(/Save|保存/);
  expect(downloadCount).toBe(0);
  await page.locator('[data-receive-sheet] [data-action="close-action-sheet"]').click();

  await page.locator('[data-action="open-send-sheet"]').click();
  await page.locator("[data-file-input]").setInputFiles({
    name: "webdrop-transfer-proof.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(5 * 1024 * 1024, 7)
  });
  await expect(page.locator("[data-send-swipe-control]")).toHaveClass(/is-ready/);
  await page.locator("[data-send-swipe-thumb]").press("Enter");
  await expect(page.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "transfer", { timeout: 2500 });
  await expect.poll(async () =>
    page.locator("[data-island-wave]").evaluate((node) => getComputedStyle(node).mixBlendMode)
  ).toBe("multiply");

  const island = await page.locator("[data-dynamic-island]").evaluate((node) => ({
    percent: node.querySelector("[data-island-transfer-percent]")?.textContent,
    label: node.querySelector("[data-island-transfer-label]")?.textContent,
    name: node.querySelector("[data-island-transfer-name]")?.textContent,
    bar: node.querySelector("[data-island-transfer-bar]")?.style.transform
  }));

  expect(island.label).toMatch(/Sending|送信中/);
  expect(island.name).toContain("webdrop-transfer-proof.bin");
  expect(island.bar).toContain("scaleX");
  expect(consoleProblems).toEqual([]);
});

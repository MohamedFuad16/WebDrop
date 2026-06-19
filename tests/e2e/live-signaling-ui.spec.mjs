import { expect, test } from "@playwright/test";

function collectConsoleProblems(page, bucket) {
  page.on("pageerror", (error) => bucket.push(error.message));
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const text = message.text();
    if (
      text.includes("GL Driver Message") ||
      text.includes("GPU stall due to ReadPixels") ||
      text.includes("CONTEXT_LOST_WEBGL")
    ) return;
    bucket.push(text);
  });
}

test("live signaling lets two same-browser pages discover only each other and connect without peer selection", async ({ browser, baseURL }, testInfo) => {
  test.skip(
    !["chromium-desktop", "webkit-iphone-15-pro"].includes(testInfo.project.name),
    "Run the live UI signaling proof once per supported browser engine."
  );

  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const aliceName = `Alice Live ${runId}`;
  const bobName = `Bob Live ${runId}`;
  const context = await browser.newContext();
  const consoleProblems = [];
  try {
    await context.route("**/js/config/runtime-config.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `globalThis.WEBDROP_RUNTIME_CONFIG = Object.freeze({
          productionSignaling: true,
          realProximityCeremony: false,
          realTransfer: true,
          qrPairing: false,
          signalingUrl: "ws://127.0.0.1:8080/ws",
          turnConfigUrl: "http://127.0.0.1:8080/api/ice-servers"
        });`
      });
    });

    const pageA = await context.newPage();
    const pageB = await context.newPage();
    let automaticDownloadsA = 0;
    let automaticDownloadsB = 0;
    pageA.on("download", () => {
      automaticDownloadsA += 1;
    });
    pageB.on("download", () => {
      automaticDownloadsB += 1;
    });
    collectConsoleProblems(pageA, consoleProblems);
    collectConsoleProblems(pageB, consoleProblems);

    await pageA.addInitScript(({ runId, aliceName }) => {
      localStorage.setItem("webdrop.deviceId", `pw-alice-device-${runId}`);
      localStorage.setItem("webdrop.deviceName", aliceName);
      localStorage.setItem("webdrop.motionPaused", "true");
      sessionStorage.clear();
    }, { runId, aliceName });
    await pageB.addInitScript(({ runId, bobName }) => {
      localStorage.setItem("webdrop.deviceId", `pw-bob-device-${runId}`);
      localStorage.setItem("webdrop.deviceName", bobName);
      localStorage.setItem("webdrop.motionPaused", "true");
      sessionStorage.clear();
    }, { runId, bobName });

    await pageA.goto(`${baseURL}/?qa=live-signaling-a`, { waitUntil: "domcontentloaded" });
    await pageB.goto(`${baseURL}/?qa=live-signaling-b`, { waitUntil: "domcontentloaded" });
    await expect(pageA.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
    await expect(pageB.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
    await expect(pageA.locator("[data-action='connect-nearby']")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.locator("[data-action='connect-nearby']")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.locator("[data-action='connect-qr']")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.locator("[data-action='connect-qr']")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.locator("[data-connection-label]")).toContainText(/Looking nearby|Connected with/, { timeout: 10_000 });
    await expect(pageB.locator("[data-connection-label]")).toContainText(/Looking nearby|Connected with/, { timeout: 10_000 });

    await expect(pageA.locator(`.peer-node:has-text('${bobName}')`)).toHaveCount(1, { timeout: 20_000 });
    await expect(pageB.locator(`.peer-node:has-text('${aliceName}')`)).toHaveCount(1, { timeout: 20_000 });
    await expect(pageA.locator(".peer-node button")).toHaveCount(0);
    await expect(pageB.locator(".peer-node button")).toHaveCount(0);

    await pageA.locator("[data-action='connect-nearby']").click();
    await expect(pageA.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "connecting", { timeout: 15_000 });
    await expect(pageA.locator("[data-island-peer-name]")).toContainText("Nearby iPhone");
    await expect(pageA.locator("[data-island-peer-name]")).not.toContainText(bobName);
    await pageB.locator("[data-action='connect-nearby']").click();
    await expect(pageB.locator("[data-island-peer-name]")).toContainText("Nearby iPhone");
    await expect(pageB.locator("[data-island-peer-name]")).not.toContainText(aliceName);

    await expect(pageA.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 45_000 });
    await expect(pageB.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 45_000 });
    await expect(pageA.locator("[data-connection-label]")).toContainText(bobName, { timeout: 10_000 });
    await expect(pageB.locator("[data-connection-label]")).toContainText(aliceName, { timeout: 10_000 });

    const aliceFileName = `alice-to-bob-${runId}.bin`;
    const bobFileName = `bob-to-alice-${runId}.bin`;
    await pageA.locator("[data-action='open-send-sheet']").click();
    await pageA.locator("[data-file-input]").setInputFiles({
      name: aliceFileName,
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(320 * 1024, 0x41)
    });
    await pageB.locator("[data-action='open-send-sheet']").click();
    await pageB.locator("[data-file-input]").setInputFiles({
      name: bobFileName,
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(384 * 1024, 0x42)
    });
    await expect(pageA.locator("[data-send-swipe-control]")).toHaveClass(/is-ready/);
    await expect(pageB.locator("[data-send-swipe-control]")).toHaveClass(/is-ready/);

    await pageA.locator("[data-send-swipe-thumb]").press("Enter");
    await expect(pageB.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "transfer", { timeout: 15_000 });
    await expect(pageB.locator("[data-dynamic-island]")).toHaveAttribute("data-transfer-direction", "receive");
    await expect(pageB.locator("[data-island-transfer-name]")).toContainText(aliceFileName);
    await expect(pageB.locator("[data-receive-badge]")).toHaveText("1", { timeout: 30_000 });
    await pageB.locator("[data-send-swipe-thumb]").press("Enter");
    await expect(pageA.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "transfer", { timeout: 15_000 });
    await expect(pageA.locator("[data-dynamic-island]")).toHaveAttribute("data-transfer-direction", "receive");
    await expect(pageA.locator("[data-island-transfer-name]")).toContainText(bobFileName);
    await expect(pageA.locator("[data-receive-badge]")).toHaveText("1", { timeout: 30_000 });
    await expect(pageA.locator("[data-send-sheet]")).toBeHidden({ timeout: 30_000 });
    await expect(pageB.locator("[data-send-sheet]")).toBeHidden({ timeout: 30_000 });
    await pageA.locator("[data-action='open-receive-sheet']").click();
    await pageB.locator("[data-action='open-receive-sheet']").click();
    await expect(pageA.locator("[data-received-list]")).toContainText(bobFileName, { timeout: 10_000 });
    await expect(pageB.locator("[data-received-list]")).toContainText(aliceFileName, { timeout: 10_000 });
    expect(automaticDownloadsA).toBe(0);
    expect(automaticDownloadsB).toBe(0);

    const [downloadA] = await Promise.all([
      pageA.waitForEvent("download"),
      pageA.locator(`.received-file:has-text('${bobFileName}') [data-action='open-received']`).click()
    ]);
    const [downloadB] = await Promise.all([
      pageB.waitForEvent("download"),
      pageB.locator(`.received-file:has-text('${aliceFileName}') [data-action='open-received']`).click()
    ]);
    expect(downloadA.suggestedFilename()).toBe(bobFileName);
    expect(downloadB.suggestedFilename()).toBe(aliceFileName);
    expect(pageA.url()).toContain("qa=live-signaling-a");
    expect(pageB.url()).toContain("qa=live-signaling-b");
    expect(automaticDownloadsA).toBe(1);
    expect(automaticDownloadsB).toBe(1);

    await pageA.locator("[data-receive-sheet] [data-action='close-action-sheet']").click();
    await pageB.locator("[data-receive-sheet] [data-action='close-action-sheet']").click();

    await pageA.locator("[data-action='disconnect']").first().click();
    await expect(pageA.locator("#app")).toHaveAttribute("data-mode", "lobby", { timeout: 10_000 });
    await expect(pageB.locator("#app")).toHaveAttribute("data-mode", "lobby", { timeout: 10_000 });

    expect(consoleProblems).toEqual([]);
  } finally {
    await context.close();
  }
});

test("manual QR backup connects explicit show and scan roles", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "QR camera fallback is exercised once in Chromium.");

  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const showName = `QR Show ${runId}`;
  const scanName = `QR Scan ${runId}`;
  const context = await browser.newContext();
  const consoleProblems = [];
  try {
    await context.route("**/js/config/runtime-config.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `globalThis.WEBDROP_RUNTIME_CONFIG = Object.freeze({
          productionSignaling: true,
          realProximityCeremony: true,
          realTransfer: false,
          qrPairing: true,
          signalingUrl: "ws://127.0.0.1:8080/ws",
          turnConfigUrl: "http://127.0.0.1:8080/api/ice-servers"
        });`
      });
    });

    const pageShow = await context.newPage();
    const pageScan = await context.newPage();
    collectConsoleProblems(pageShow, consoleProblems);
    collectConsoleProblems(pageScan, consoleProblems);

    await pageShow.addInitScript(({ runId, showName }) => {
      localStorage.setItem("webdrop.deviceId", `qr-show-${runId}`);
      localStorage.setItem("webdrop.deviceName", showName);
      sessionStorage.clear();
    }, { runId, showName });
    await pageScan.addInitScript(({ runId, scanName }) => {
      localStorage.setItem("webdrop.deviceId", `qr-scan-${runId}`);
      localStorage.setItem("webdrop.deviceName", scanName);
      sessionStorage.clear();
      delete globalThis.BarcodeDetector;
      const mediaDevices = navigator.mediaDevices;
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 240;
          globalThis.__webdropFakeCamera = canvas;
          const context2d = canvas.getContext("2d");
          context2d.fillStyle = "#fff";
          context2d.fillRect(0, 0, canvas.width, canvas.height);
          if (globalThis.__webdropQrImage) {
            context2d.drawImage(globalThis.__webdropQrImage, 50, 10, 220, 220);
          }
          globalThis.__webdropCameraRequestedDuringClick = true;
          const stream = canvas.captureStream(12);
          globalThis.__webdropFakeCameraTrack = stream.getVideoTracks()[0];
          return stream;
        }
      });
    }, { runId, scanName });

    await pageShow.goto(`${baseURL}/?qa=live-qr-show`, { waitUntil: "domcontentloaded" });
    await pageScan.goto(`${baseURL}/?qa=live-qr-scan`, { waitUntil: "domcontentloaded" });
    await expect(pageShow.locator(`.peer-node:has-text('${scanName}')`)).toHaveCount(1, { timeout: 20_000 });
    await expect(pageScan.locator(`.peer-node:has-text('${showName}')`)).toHaveCount(1, { timeout: 20_000 });

    await pageShow.locator("[data-action='connect-qr']").click();
    await expect(pageShow.locator("[data-qr-sheet]")).toBeVisible();
    await pageShow.locator("[data-action='qr-show']").click();
    await expect(pageShow.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "qr-display", { timeout: 20_000 });
    const qrFrame = await pageShow.locator("[data-island-qr-canvas]").evaluate((canvas) => {
      const context2d = canvas.getContext("2d");
      const frame = context2d.getImageData(0, 0, canvas.width, canvas.height);
      return {
        token: globalThis.jsQR(frame.data, canvas.width, canvas.height)?.data || "",
        dataUrl: canvas.toDataURL("image/png")
      };
    });
    expect(qrFrame.token).not.toBe("");
    await pageScan.evaluate(async (dataUrl) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", reject, { once: true });
        image.src = dataUrl;
      });
      globalThis.__webdropQrImage = image;
    }, qrFrame.dataUrl);

    await pageScan.locator("[data-action='connect-qr']").click();
    await expect(pageScan.locator("[data-qr-sheet]")).toBeVisible();
    await pageScan.locator("[data-action='qr-scan']").click();
    await expect(pageScan.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "qr-scan", { timeout: 20_000 });
    await expect.poll(() => pageScan.evaluate(() => globalThis.__webdropCameraRequestedDuringClick)).toBe(true);

    await expect(pageShow.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 30_000 });
    await expect(pageScan.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 30_000 });
    expect(consoleProblems).toEqual([]);
  } finally {
    await context.close();
  }
});

test("proximity failure below 55 shows the score error and offers QR backup", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "chromium-desktop", "Physical-score failure is exercised once in Chromium.");

  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/136 Mobile Safari/537.36"
  });
  try {
    await context.route("**/js/config/runtime-config.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `globalThis.WEBDROP_RUNTIME_CONFIG = Object.freeze({
          productionSignaling: true,
          realProximityCeremony: true,
          realTransfer: false,
          qrPairing: true,
          signalingUrl: "ws://127.0.0.1:8080/ws",
          turnConfigUrl: "http://127.0.0.1:8080/api/ice-servers"
        });`
      });
    });
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await pageA.addInitScript((id) => {
      localStorage.setItem("webdrop.deviceId", `android-a-${id}`);
      localStorage.setItem("webdrop.deviceName", `Android A ${id}`);
      sessionStorage.clear();
    }, runId);
    await pageB.addInitScript((id) => {
      localStorage.setItem("webdrop.deviceId", `android-b-${id}`);
      localStorage.setItem("webdrop.deviceName", `Android B ${id}`);
      sessionStorage.clear();
    }, runId);

    await pageA.goto(`${baseURL}/?qa=android-score-a`, { waitUntil: "domcontentloaded" });
    await pageB.goto(`${baseURL}/?qa=android-score-b`, { waitUntil: "domcontentloaded" });
    await expect(pageA.locator(".peer-node")).toHaveCount(1, { timeout: 20_000 });
    await expect(pageB.locator(".peer-node")).toHaveCount(1, { timeout: 20_000 });
    await pageA.locator("[data-action='connect-nearby']").click();
    await expect(pageA.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "connecting", { timeout: 15_000 });
    await expect(pageA.locator("[data-island-peer-name]")).toContainText("Nearby iPhone");
    await pageB.locator("[data-action='connect-nearby']").click();
    await expect(pageB.locator("[data-island-peer-name]")).toContainText("Nearby iPhone");

    await expect(pageA.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "verification-failed", { timeout: 30_000 });
    await expect(pageA.locator("[data-island-ceremony-stage]")).toContainText("Score not enough");
    await expect(pageA.locator("[data-island-ceremony-error]")).toContainText("must be at least 55");
    await expect(pageA.locator("[data-island-retry]")).toBeVisible();
    await expect(pageA.locator("[data-island-retry]")).toHaveText("Retry");
    await expect(pageA.locator("[data-island-fallback]")).toBeVisible();
    await pageA.waitForTimeout(50_000);
    await expect(pageA.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "verification-failed");
    await expect(pageA.locator("[data-qr-sheet]")).toBeHidden();
    await pageB.locator("[data-island-fallback]").click();
    await expect(pageB.locator("[data-qr-sheet]")).toBeVisible({ timeout: 10_000 });

    await pageB.close();
    await expect(pageA.locator(".peer-node")).toHaveCount(0, { timeout: 10_000 });
    await pageA.locator("[data-island-retry]").click();
    await expect(pageA.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "connecting", { timeout: 10_000 });
    await expect(pageA.locator("[data-island-peer-avatar]")).toHaveAttribute("data-anonymous", "true");
  } finally {
    await context.close();
  }
});

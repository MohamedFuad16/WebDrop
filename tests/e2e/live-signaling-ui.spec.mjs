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

test("live signaling lets two same-browser pages discover only each other and connect", async ({ browser, baseURL }, testInfo) => {
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
    await expect(pageA.locator("[data-action='open-nearby-sheet']")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.locator("[data-action='open-nearby-sheet']")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.locator("[data-connection-label]")).toContainText(/Looking nearby|Connected with/, { timeout: 10_000 });
    await expect(pageB.locator("[data-connection-label]")).toContainText(/Looking nearby|Connected with/, { timeout: 10_000 });

    await pageA.locator("[data-action='open-nearby-sheet']").click();
    await expect(pageA.locator("[data-nearby-sheet]")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.locator(`.nearby-device-row:has-text('${bobName}')`)).toHaveCount(1, { timeout: 20_000 });

    await pageB.locator("[data-action='open-nearby-sheet']").click();
    await expect(pageB.locator("[data-nearby-sheet]")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.locator(`.nearby-device-row:has-text('${aliceName}')`)).toHaveCount(1, { timeout: 20_000 });
    await pageB.locator("[data-action='close-nearby-sheet']").click();

    await pageA.locator(`.nearby-device-row:has-text('${bobName}') .nearby-connect`).click();
    await expect(pageA.locator("[data-peer-sheet]")).toBeVisible({ timeout: 10_000 });
    await pageA.locator("[data-swipe-thumb]").press("Enter");
    await expect(pageB.locator("[data-peer-sheet]")).toBeVisible({ timeout: 15_000 });
    await expect(pageB.locator("[data-sheet-peer-name]")).toContainText(aliceName);

    await pageB.locator("[data-swipe-thumb]").press("Enter");

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

    await Promise.all([
      pageA.locator("[data-send-swipe-thumb]").press("Enter"),
      pageB.locator("[data-send-swipe-thumb]").press("Enter")
    ]);

    await expect(pageA.locator("[data-receive-badge]")).toHaveText("1", { timeout: 30_000 });
    await expect(pageB.locator("[data-receive-badge]")).toHaveText("1", { timeout: 30_000 });
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

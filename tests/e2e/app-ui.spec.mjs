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

test("loads the WebDrop shell, receive UI, and streaming download copy", async ({ page }) => {
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
  await expect(page.locator("[data-i18n='appInfoStackCopy']")).toContainText("streamed browser downloads with Blob fallback");
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

test("connects by swipe, selects a file, and shows Dynamic Island transfer progress", async ({ page }) => {
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
  await expect(page.locator('[data-action="open-nearby-sheet"]')).toBeVisible({ timeout: 7000 });
  await expect(page.locator(".peer-node").first()).toBeVisible({ timeout: 7000 });
  await page.locator('[data-action="open-nearby-sheet"]').click();
  await expect(page.locator('[data-nearby-device-id="peer-aki"]')).toBeVisible();
  await page.locator('[data-nearby-device-id="peer-aki"] .nearby-connect').click();
  await page.locator("[data-swipe-thumb]").press("Enter");
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

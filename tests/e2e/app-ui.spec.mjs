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

  await page.goto("/?qa=e2e-ui", { waitUntil: "domcontentloaded" });

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

  await page.goto("/?qa=e2e-stream-adapter", { waitUntil: "domcontentloaded" });
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

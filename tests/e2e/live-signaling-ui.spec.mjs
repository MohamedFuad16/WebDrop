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
  test.skip(testInfo.project.name !== "chromium-desktop", "Run the live UI signaling proof once on desktop Chromium.");

  const runId = Date.now().toString(36);
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const consoleProblems = [];
  collectConsoleProblems(pageA, consoleProblems);
  collectConsoleProblems(pageB, consoleProblems);

  await pageA.addInitScript(({ runId }) => {
    localStorage.setItem("webdrop.deviceId", `pw-alice-device-${runId}`);
    localStorage.setItem("webdrop.deviceName", "Alice Live");
    localStorage.setItem("webdrop.motionPaused", "true");
    sessionStorage.clear();
  }, { runId });
  await pageB.addInitScript(({ runId }) => {
    localStorage.setItem("webdrop.deviceId", `pw-bob-device-${runId}`);
    localStorage.setItem("webdrop.deviceName", "Bob Live");
    localStorage.setItem("webdrop.motionPaused", "true");
    sessionStorage.clear();
  }, { runId });

  await pageA.goto(`${baseURL}/?qa=live-signaling-a`, { waitUntil: "domcontentloaded" });
  await pageB.goto(`${baseURL}/?qa=live-signaling-b`, { waitUntil: "domcontentloaded" });

  await pageA.locator("[data-action='open-nearby-sheet']").click();
  await expect(pageA.locator(".nearby-device-row:has-text('Bob Live')")).toHaveCount(1, { timeout: 15_000 });

  await pageB.locator("[data-action='open-nearby-sheet']").click();
  await expect(pageB.locator(".nearby-device-row:has-text('Alice Live')")).toHaveCount(1, { timeout: 15_000 });
  await pageB.locator("[data-action='close-nearby-sheet']").click();

  await pageA.locator(".nearby-device-row:has-text('Bob Live') .nearby-connect").click();
  await expect(pageA.locator("[data-peer-sheet]")).toBeVisible({ timeout: 10_000 });
  await pageA.locator("[data-swipe-thumb]").press("Enter");
  await expect(pageB.locator("[data-peer-sheet]")).toBeVisible({ timeout: 15_000 });
  await expect(pageB.locator("[data-sheet-peer-name]")).toContainText("Alice Live");

  await pageB.locator("[data-swipe-thumb]").press("Enter");

  await expect(pageA.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 45_000 });
  await expect(pageB.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 45_000 });
  await expect(pageA.locator("[data-connection-label]")).toContainText(/Bob Live|Connected with/, { timeout: 10_000 });
  await expect(pageB.locator("[data-connection-label]")).toContainText(/Alice Live|Connected with/, { timeout: 10_000 });

  await pageA.locator("[data-action='disconnect']").first().click();
  await expect(pageA.locator("#app")).toHaveAttribute("data-mode", "lobby", { timeout: 10_000 });
  await expect(pageB.locator("#app")).toHaveAttribute("data-mode", "lobby", { timeout: 10_000 });

  await context.close();
  expect(consoleProblems).toEqual([]);
});

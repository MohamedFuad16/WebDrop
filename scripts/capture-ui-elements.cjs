const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const CAPTURE_LOCALE = process.env.CAPTURE_LOCALE === "ja" ? "ja" : "en";
const OUT_DIR = path.join(ROOT, "output", "screenshots", `ui-elements-${CAPTURE_LOCALE}`);
const URL = process.env.WEBDROP_URL || "http://127.0.0.1:4180/";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  await page.goto(`${URL}?capture=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("webdrop.theme", "light");
    localStorage.setItem("webdrop.motionPaused", "true");
  }, CAPTURE_LOCALE);
  await page.evaluate((locale) => {
    localStorage.setItem("webdrop.locale", locale);
  }, CAPTURE_LOCALE);
  await reloadUntilReady(page);
  await page.waitForTimeout(500);

  const inventory = [];
  const add = async (name, selector, label, description, options = {}) => {
    const file = `${name}.png`;
    const target = page.locator(selector);
    await target.waitFor({ state: "visible", timeout: 5000 });
    if (options.margin) {
      const box = await target.boundingBox();
      const margin = options.margin;
      await page.screenshot({
        path: path.join(OUT_DIR, file),
        clip: {
          x: Math.max(0, box.x - margin),
          y: Math.max(0, box.y - margin),
          width: Math.min(page.viewportSize().width - Math.max(0, box.x - margin), box.width + margin * 2),
          height: Math.min(page.viewportSize().height - Math.max(0, box.y - margin), box.height + margin * 2)
        }
      });
    } else {
      await target.screenshot({ path: path.join(OUT_DIR, file) });
    }
    inventory.push({ name, file, label, description });
  };

  await add("app-light", ".app-shell", "Light home screen", "The main nearby-device surface in light mode, with the WebDrop status, four orbits, a gently animated self icon, and static orbit peers.");
  await add("topbar-brand", ".brand-lockup", "WebDrop status pill", "Shows the WebDrop label and nearby or connected status without exposing transfer controls too early.", { margin: 8 });
  await add("settings-icon", "[data-action='settings']", "Settings icon", "Opens the settings sheet for profile icon, ring color, language, app information, and version.", { margin: 8 });
  await add("theme-icon", ".theme-button", "Theme toggle", "Switches between light and dark mode from the main screen.", { margin: 8 });
  await add("topbar-actions", ".topbar-actions", "Header actions", "Settings and theme controls are grouped in the top-right header area.", { margin: 8 });

  await page.evaluate(() => {
    const style = document.createElement("style");
    style.id = "capture-hide-peers";
    style.textContent = ".peer-orbits{display:none!important}";
    document.head.appendChild(style);
  });
  await add("orbit-empty", ".orbit-scene", "Orbit layers without peers", "The clean App Clip-inspired orbit pattern before showing nearby devices.");
  await page.evaluate(() => document.querySelector("#capture-hide-peers")?.remove());
  await add("orbit-with-peers", ".orbit-scene", "Orbit layers with peers", "Nearby candidates sit on separate rings with static profile icons so orbital movement remains calm.");

  await page.click("[data-peer-id='peer-aki']", { force: true });
  await page.waitForSelector("[data-peer-sheet].is-open");
  await add("connect-sheet", "[data-peer-sheet]", "Connect sheet", "Peer selection opens a bottom sheet where the user confirms by swiping right.");
  await add("connect-friend-strip", "[data-friend-strip]", "Friend strip", "The candidate strip uses the same profile style as the orbit icons, with a small overlap and visible circular edges.", { margin: 8 });

  await page.evaluate(() => {
    const control = document.querySelector("[data-swipe-control]");
    const thumb = document.querySelector("[data-swipe-thumb]");
    const cb = control.getBoundingClientRect();
    const tb = thumb.getBoundingClientRect();
    const y = tb.top + tb.height / 2;
    const startX = tb.left + tb.width / 2;
    const endX = cb.right - 12;
    const opts = { bubbles: true, cancelable: true, pointerId: 77, pointerType: "mouse", isPrimary: true };
    thumb.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: startX, clientY: y }));
    control.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: endX, clientY: y }));
    control.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: endX, clientY: y }));
  });
  await page.waitForSelector("[data-connection-tray]:not([hidden])", { timeout: 7000 });
  await page.waitForTimeout(350);
  await add("orbit-connected", ".orbit-scene", "Connected Venn state", "The current device and selected peer overlap as an equal-size, static Venn-style pair with animated connected rings.");
  await add("topbar-brand-connected", ".brand-lockup", "Connected status pill", "After connection, the status line names the connected peer.", { margin: 8 });
  await add("dock-actions", ".action-dock", "Connected dock", "Send, receive, chat, and disconnect appear only after the connection is verified.", { margin: 8 });
  await add("dock-send-icon", ".dock-button--send", "Send icon", "Opens the send sheet.", { margin: 8 });
  await add("dock-receive-icon", ".dock-button--receive", "Receive icon", "Opens received files and shows a badge when files are available.", { margin: 8 });
  await add("dock-chat-icon", ".dock-button--chat", "Chat icon", "Opens the peer chat sheet.", { margin: 8 });
  await add("dock-disconnect-icon", ".dock-button--disconnect", "Disconnect icon", "Disconnects directly with a short release animation.", { margin: 8 });

  await page.click(".dock-button--send", { force: true });
  await page.waitForSelector("[data-send-sheet].is-open");
  await add("send-sheet-empty", "[data-send-sheet]", "Send sheet before file selection", "The user chooses files first; the send swipe remains disabled until a file is selected.");
  await page.setInputFiles("[data-file-input]", { name: "demo-guide.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 demo") });
  await page.waitForSelector("[data-send-swipe-control].is-ready");
  await page.waitForTimeout(150);
  await add("send-sheet-selected", "[data-send-sheet]", "Send sheet after file selection", "A selected file appears in the list and the swipe-up send control keeps its icon below the text.");
  await page.click("[data-send-sheet] [data-action='close-action-sheet']", { force: true });
  await page.waitForTimeout(450);

  await page.click(".dock-button--receive", { force: true });
  await page.waitForSelector("[data-receive-sheet].is-open");
  await add("receive-sheet", "[data-receive-sheet]", "Receive sheet", "Received demo PDFs appear here with an Open action and the dock badge reflects the count.");
  await page.click("[data-receive-sheet] [data-action='close-action-sheet']", { force: true });
  await page.waitForTimeout(450);

  await page.click(".dock-button--chat", { force: true });
  await page.waitForSelector("[data-chat-sheet].is-open");
  await page.fill("[data-chat-input]", "Looks good from here.");
  await page.evaluate(() => document.querySelector("[data-action='send-chat']")?.click());
  await page.waitForTimeout(750);
  await add("chat-sheet", "[data-chat-sheet]", "Chat sheet", "Chat is separated into its own scrollable bubble conversation instead of sharing the file tray.");
  await page.click("[data-chat-sheet] [data-action='close-action-sheet']", { force: true });
  await page.waitForTimeout(450);

  await page.click("[data-action='settings']", { force: true });
  await page.waitForSelector("[data-settings-sheet].is-open");
  await page.waitForTimeout(650);
  await add("settings-sheet", "[data-settings-sheet]", "Settings sheet", "Settings hold device name, profile, ring, language, app information, and version.", { margin: 2 });
  await add("settings-device-name", ".settings-device-name", "Device name field", "The device name can be edited, including clearing the final character without an unwanted reset.", { margin: 8 });
  await add("settings-profile-icons", ".avatar-setting", "Profile icon selector", "Users swipe across the provided character icons instead of uploading a photo.", { margin: 8 });
  await add("settings-profile-ring", ".ring-setting", "Profile ring selector", "The default ring is white, with optional blue, green, purple, and rose choices.", { margin: 8 });
  await add("settings-language", ".language-setting", "Language selector", "Switches every app label between English and Japanese.", { margin: 8 });
  await add("settings-app-info-link", ".settings-link", "App information link", "Moves design, stack, and orbit motion details into a separate sheet.", { margin: 8 });
  await add("settings-app-version", ".app-version", "App version", "Shows the current prototype version, 1.0.24, at the bottom of Settings.", { margin: 8 });
  await page.click("[data-action='open-information']", { force: true });
  await page.waitForSelector("[data-information-sheet].is-open");
  await page.waitForTimeout(650);
  await add("app-information-sheet", "[data-information-sheet]", "App information sheet", "Explains the prototype and contains orbit motion controls without cluttering the settings page.", { margin: 2 });

  await page.evaluate(() => localStorage.setItem("webdrop.theme", "dark"));
  await reloadUntilReady(page);
  await add("app-dark", ".app-shell", "Dark home screen", "The same nearby-device UI in dark mode.");
  await page.evaluate(() => {
    localStorage.setItem("webdrop.theme", "light");
    localStorage.setItem("webdrop.motionPaused", "false");
  });

  fs.writeFileSync(path.join(OUT_DIR, "inventory.json"), JSON.stringify(inventory, null, 2));
  await browser.close();
  console.log(`Captured ${inventory.length} UI screenshots in ${OUT_DIR}`);
}

async function reloadUntilReady(page, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(
        () => document.querySelectorAll("[data-peer-id]").length > 0,
        null,
        { timeout: 10000 }
      );
      await page.evaluate(() => document.fonts.ready);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

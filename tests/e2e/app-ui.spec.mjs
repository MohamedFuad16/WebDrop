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

test("emitted chirp reaches and is recognized by a second acoustic sensor", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Web Audio loopback is validated once in desktop Chromium.");
  await page.goto("/tests/e2e/blank.html");
  await page.evaluate(() => {
    document.body.innerHTML = '<button type="button" data-audio-unlock>Unlock audio</button>';
  });
  await page.locator("[data-audio-unlock]").click();

  const result = await page.evaluate(async () => {
    const { AcousticProximitySensor } = await import("/js/services/acoustic-proximity.js?qa=chirp-loopback");
    const context = new AudioContext({ sampleRate: 48_000 });
    await context.resume();
    const link = context.createMediaStreamDestination();
    const outputContext = {
      get state() { return context.state; },
      get currentTime() { return context.currentTime; },
      get sampleRate() { return context.sampleRate; },
      destination: link,
      resume: () => context.resume(),
      createBuffer: (...args) => context.createBuffer(...args),
      createBufferSource: () => context.createBufferSource(),
      createGain: () => context.createGain()
    };
    const sender = new AcousticProximitySensor({ audioContextFactory: () => outputContext });
    const receiver = new AcousticProximitySensor({
      audioContextFactory: () => context,
      mediaDevices: { getUserMedia: async () => link.stream }
    });
    const permission = await receiver.requestMicrophonePermission();
    const detectionPromise = receiver.detectChirp({
      timeoutMs: 1000,
      pollIntervalMs: 8,
      requiredBandHits: 2
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const emitted = await sender.emitChirp();
    const detected = await detectionPromise;
    receiver.stopCapture();
    link.stream.getTracks().forEach((track) => track.stop());
    await context.close();
    return { permission: permission.granted, emitted, detected };
  });

  expect(result.permission).toBe(true);
  expect(result.emitted).toMatchObject({ emitted: true, durationMs: 72, sampleRate: 48_000 });
  expect(result.detected.detected).toBe(true);
  expect(result.detected.correlation).toBeGreaterThan(0.9);
  expect(result.detected.band.marginDb).toBeGreaterThan(20);
});

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
    const sceneStyle = getComputedStyle(document.querySelector(".orbit-scene"));
    const peerStyle = getComputedStyle(document.querySelector(".peer-node"));
    const ringStyle = getComputedStyle(document.querySelector(".orbit-ring"));
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
      radiusErrors: peers.map((peer) => Math.abs(peer.centerDistance - ringRadii[peer.ring])),
      compositor: {
        sceneContain: sceneStyle.contain,
        peerWillChange: peerStyle.willChange,
        ringWillChange: ringStyle.willChange,
        peerTransform: peerStyle.transform
      }
    };
  });

  expect(geometry.minimumClearance).toBeGreaterThanOrEqual(8);
  expect(Math.max(...geometry.radiusErrors)).toBeLessThanOrEqual(1.5);
  expect(
    ["content", "strict"].includes(geometry.compositor.sceneContain)
      || geometry.compositor.sceneContain.includes("paint")
  ).toBe(true);
  expect(geometry.compositor.peerWillChange).toContain("transform");
  expect(geometry.compositor.ringWillChange).toContain("transform");
  expect(geometry.compositor.peerTransform).not.toBe("none");
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

test("requests iPhone motion and microphone permissions from one user gesture", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-iphone-15-pro", "iPhone permission behavior is WebKit-specific.");

  await page.goto("/tests/e2e/blank.html?qa=e2e-webkit-proximity-permissions", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const calls = [];
    globalThis.DeviceMotionEvent = {
      async requestPermission() {
        calls.push("motion");
        return "granted";
      }
    };
    const mediaDevices = {
      async getUserMedia(constraints) {
        calls.push("microphone");
        globalThis.__webdropRequestedAudio = constraints;
        return { active: true };
      }
    };
    const [{ MotionProximitySensor }, { AcousticProximitySensor }] = await Promise.all([
      import("/js/services/motion-proximity.js?v=e2e-webkit-permissions"),
      import("/js/services/acoustic-proximity.js?v=e2e-webkit-permissions")
    ]);
    const button = document.createElement("button");
    button.textContent = "Allow proximity";
    button.addEventListener("click", async () => {
      const motion = new MotionProximitySensor({ target: globalThis });
      const acoustic = new AcousticProximitySensor({ mediaDevices });
      const motionPromise = motion.requestPermission();
      const microphonePromise = acoustic.requestMicrophonePermission();
      const [motionResult, microphoneResult] = await Promise.all([motionPromise, microphonePromise]);
      globalThis.__webdropPermissionResult = { calls, motionResult, microphoneResult };
    });
    document.body.append(button);
  });

  await page.getByRole("button", { name: "Allow proximity" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__webdropPermissionResult)).toMatchObject({
    calls: ["motion", "microphone"],
    motionResult: { granted: true },
    microphoneResult: { granted: true }
  });
  await expect.poll(() => page.evaluate(() => globalThis.__webdropRequestedAudio)).toEqual({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  });
});

test("requests iPhone QR camera permission from the Scan gesture", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-iphone-15-pro", "iPhone permission behavior is WebKit-specific.");

  await page.goto("/tests/e2e/blank.html?qa=e2e-webkit-qr-permission", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const calls = [];
    const stream = {
      getTracks: () => [{ stop() {} }],
      getVideoTracks: () => []
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia(constraints) {
          calls.push({ constraints, active: navigator.userActivation?.isActive ?? true });
          return stream;
        }
      }
    });
    document.body.innerHTML = `
      <section data-dynamic-island data-state="closed">
        <button data-island-camera>Start camera</button>
        <div data-island-scanner></div>
        <video data-island-video muted playsinline></video>
      </section>
      <button id="scan">Scan QR</button>
    `;
    const { DynamicIsland } = await import("/js/ui/dynamic-island.js?v=e2e-webkit-camera-gesture");
    const island = new DynamicIsland(document, (key) => key);
    document.querySelector("#scan").addEventListener("click", () => island.prepareCameraFromGesture());
    globalThis.__webdropCameraCalls = calls;
  });

  await page.getByRole("button", { name: "Scan QR" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__webdropCameraCalls)).toMatchObject([{
    active: true,
    constraints: {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    }
  }]);
});

test("renders a nonblank Siri wave on iPhone WebKit without WebGL", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-iphone-15-pro", "iPhone rendering is WebKit-specific.");

  await page.goto("/tests/e2e/blank.html?qa=e2e-webkit-siri-wave", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.style.width = "240px";
    canvas.style.height = "116px";
    document.body.append(canvas);
    const { SiriWaveCore } = await import("/js/ui/siri-wave.js?v=e2e-webkit-wave");
    const wave = new SiriWaveCore(canvas);
    wave.renderOnce(1.2);
    const context = wave.canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, wave.canvas.width, wave.canvas.height).data;
    let nontransparent = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) nontransparent += 1;
    }
    return {
      renderer: wave.canvas.dataset.waveRenderer,
      width: wave.canvas.width,
      height: wave.canvas.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      nontransparent
    };
  });

  expect(result.renderer).toBe("canvas2d");
  expect(result.width).toBeGreaterThan(100);
  expect(result.width).toBeLessThanOrEqual(Math.ceil(240 * Math.min(1.5, result.devicePixelRatio)));
  expect(result.height).toBeGreaterThan(50);
  expect(result.height).toBeLessThanOrEqual(Math.ceil(116 * Math.min(1.5, result.devicePixelRatio)));
  expect(result.nontransparent).toBeGreaterThan(500);
});

test("anchors Dynamic Island expansion to the hardware island safe area", async ({ page }) => {
  await page.goto("/?qa=e2e-island-safe-area&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });
  const geometry = await page.locator("[data-dynamic-island]").evaluate((node) => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    node.style.transition = "none";
    node.querySelector(".webdrop-island__content").style.transition = "none";
    node.querySelector(".webdrop-island__cancel").style.transition = "none";
    const closedTransform = new DOMMatrix(getComputedStyle(node).transform);
    node.dataset.state = "connecting";
    getComputedStyle(node).transform;
    const content = node.querySelector(".webdrop-island__content");
    const pill = node.querySelector(".webdrop-island__pill");
    const cancel = node.querySelector(".webdrop-island__cancel");
    const rect = node.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const cancelRect = cancel.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      closedTranslateY: Math.round(closedTransform.m42),
      pillTop: Math.round(pillRect.top),
      contentPaddingTop: Math.round(parseFloat(getComputedStyle(content).paddingTop)),
      pillBottomOffset: Math.round(pillRect.bottom - rect.top),
      cancelTopOffset: Math.round(cancelRect.top - rect.top),
      backgroundColor: getComputedStyle(node).backgroundColor,
      inkColor: getComputedStyle(node).color
    };
  });

  expect(geometry.top).toBe(0);
  expect(geometry.closedTranslateY).toBeGreaterThanOrEqual(8);
  expect(geometry.closedTranslateY).toBeLessThanOrEqual(12);
  expect(geometry.pillTop).toBeGreaterThanOrEqual(6);
  expect(geometry.pillTop).toBeLessThanOrEqual(7);
  expect(geometry.contentPaddingTop).toBeGreaterThan(geometry.pillBottomOffset + 24);
  expect(geometry.cancelTopOffset).toBeGreaterThanOrEqual(67);
  expect(geometry.backgroundColor).toBe("rgb(5, 5, 5)");
  expect(geometry.inkColor).toBe("rgb(255, 255, 255)");
});

test("uses black browser chrome while the Dynamic Island is expanded", async ({ page }) => {
  await page.goto("/?qa=e2e-island-browser-chrome&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });
  const colors = await page.evaluate(async () => {
    const { DynamicIsland } = await import("/js/ui/dynamic-island.js?v=e2e-browser-chrome");
    const island = new DynamicIsland(document, (key) => key);
    island.setState("connecting");
    const expanded = document.querySelector('meta[name="theme-color"]')?.content;
    island.setState("closed");
    const closed = document.querySelector('meta[name="theme-color"]')?.content;
    return { expanded, closed };
  });

  expect(colors.expanded).toBe("#000000");
  expect(colors.closed).toBe("#f3f3f1");
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

test("opens received View in a new tab on iPhone WebKit without leaving WebDrop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-iphone-15-pro", "iPhone new-tab receive behavior is WebKit-specific.");

  await page.addInitScript(() => {
    const calls = [];
    window.open = (url, target, features) => {
      calls.push({
        url: String(url || ""),
        target: String(target || ""),
        features: String(features || ""),
        active: navigator.userActivation?.isActive ?? true
      });
      return { closed: false, opener: null };
    };
    globalThis.__webdropWindowOpenCalls = calls;
  });
  await page.goto("/?qa=e2e-ios-view-received&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });
  await page.locator('[data-action="connect-nearby"]').click();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 7000 });
  const beforeUrl = page.url();
  await page.locator('[data-action="open-receive-sheet"]').click();
  await expect(page.locator("[data-receive-sheet]")).toBeVisible();
  await expect(page.locator("[data-received-list] [data-action='open-received']")).toHaveText(/View|表示/);
  await page.locator("[data-received-list] [data-action='open-received']").click();

  await expect.poll(() => page.evaluate(() => globalThis.__webdropWindowOpenCalls.length)).toBe(1);
  const calls = await page.evaluate(() => globalThis.__webdropWindowOpenCalls);
  expect(calls[0].url).toContain("output/pdf/webdrop-demo-en.pdf");
  expect(calls[0].target).toBe("_blank");
  expect(calls[0].features).toContain("noopener");
  expect(calls[0].features).toContain("noreferrer");
  expect(calls[0].active).toBe(true);
  expect(page.url()).toBe(beforeUrl);
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "connected");
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

test("connects from the global proximity button, selects a file, and shows Dynamic Island transfer progress", async ({ page }, testInfo) => {
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
  await expect(page.locator("[data-qr-sheet]")).toBeVisible();
  await expect(page.locator("[data-qr-sheet-peer]")).toContainText(/Nearby iPhone|近くのiPhone/);
  await expect(page.locator("[data-qr-sheet] [data-action='qr-show']")).toBeVisible();
  await expect(page.locator("[data-qr-sheet] [data-action='qr-scan']")).toBeVisible();
  await page.locator("[data-qr-sheet] [data-action='close-qr-sheet']").click();
  await expect(page.locator("[data-qr-sheet]")).toBeHidden();
  await page.locator('[data-action="connect-nearby"]').click();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 7000 });
  await page.waitForTimeout(300);
  expect(downloadCount).toBe(0);
  await page.locator('[data-action="open-receive-sheet"]').click();
  const receiveActionPattern = testInfo.project.name.includes("iphone") ? /View|表示/ : /Save|保存/;
  await expect(page.locator("[data-received-list] button").first()).toHaveText(receiveActionPattern);
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
  ).toBe("screen");

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

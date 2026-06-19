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
  expect(result.emitted.startFrequencyHz).toBeGreaterThanOrEqual(20_000);
  expect(result.emitted.endFrequencyHz).toBeGreaterThan(result.emitted.startFrequencyHz);
  expect(result.detected.detected).toBe(true);
  expect(result.detected.correlation).toBeGreaterThan(0.3);
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

test("keeps mobile sheet controls at least 44 CSS pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?qa=e2e-touch-targets&runtime=mock", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator("[data-settings-sheet]")).toHaveClass(/is-open/);
  await page.waitForTimeout(400);

  const settingsTargets = page.locator(
    "[data-settings-sheet] .sheet-close-icon, [data-settings-sheet] .ring-choice button"
  );
  await expect(settingsTargets).toHaveCount(6);
  for (const target of await settingsTargets.all()) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  await page.locator('[data-action="open-information"]').click();
  await expect(page.locator("[data-information-sheet]")).toHaveClass(/is-open/);
  await page.waitForTimeout(400);
  for (const target of await page.locator(
    "[data-information-sheet] .sheet-back-icon, [data-information-sheet] .sheet-close-icon"
  ).all()) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test("does not steal focus when a sheet finishes opening", async ({ page }) => {
  await page.goto("/?qa=e2e-sheet-focus&runtime=mock", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(40);
  await page.keyboard.press("Tab");
  await expect(page.locator("[data-name-input]")).toBeFocused();

  await page.waitForTimeout(500);
  await expect(page.locator("[data-name-input]")).toBeFocused();
});

test("keeps the focused chat composer visible above a short iPhone keyboard viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-iphone-15-pro", "The visual-keyboard viewport path is validated in iPhone WebKit.");
  await page.goto("/?qa=e2e-chat-keyboard&runtime=mock", { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="connect-nearby"]').click();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 10000 });

  await page.locator('[data-action="open-chat-sheet"]').click();
  await expect(page.locator("[data-chat-input]")).toBeFocused();
  await page.setViewportSize({ width: 393, height: 320 });

  await expect.poll(async () => page.locator("[data-chat-sheet]").evaluate((sheet) => {
    const input = sheet.querySelector("[data-chat-input]").getBoundingClientRect();
    const send = sheet.querySelector('[data-action="send-chat"]').getBoundingClientRect();
    return input.top >= 0 && input.bottom <= innerHeight && send.top >= 0 && send.bottom <= innerHeight;
  })).toBe(true);
});

test("renders a branded QR that remains machine-readable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "QR pixel output is validated once in Chromium.");
  await page.goto("/?qa=e2e-branded-qr&runtime=mock", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const { DynamicIsland } = await import("/js/ui/dynamic-island.js?v=e2e-branded-qr");
    const island = new DynamicIsland(document, (key) => key);
    const token = "webdrop:pair:branded-qr-regression-token";
    island.drawQr(token);
    const canvas = document.querySelector("[data-island-qr-canvas]");
    const context = canvas.getContext("2d");
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set();
    for (let index = 0; index < frame.data.length; index += 4) {
      const alpha = frame.data[index + 3];
      if (!alpha) continue;
      colors.add(`${frame.data[index]},${frame.data[index + 1]},${frame.data[index + 2]}`);
    }
    return {
      decoded: globalThis.jsQR(frame.data, canvas.width, canvas.height)?.data || "",
      hasBlue: colors.has("23,104,229"),
      hasTeal: colors.has("8,125,114"),
      hasViolet: colors.has("96,69,184"),
      colorCount: colors.size
    };
  });

  expect(result.decoded).toBe("webdrop:pair:branded-qr-regression-token");
  expect(result.hasBlue).toBe(true);
  expect(result.hasTeal).toBe(true);
  expect(result.hasViolet).toBe(true);
  expect(result.colorCount).toBeGreaterThanOrEqual(5);
});

test("attaches QR and receive sheets to every mobile viewport edge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-iphone-15-pro", "Edge-to-edge sheet geometry is mobile-specific.");
  await page.goto("/?qa=e2e-edge-to-edge-sheets&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });

  const measureSheet = (selector) => page.locator(selector).evaluate((sheet) => {
    const rect = sheet.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(window.innerWidth - rect.right),
      bottom: Math.round(window.innerHeight - rect.bottom),
      width: Math.round(rect.width),
      viewport: window.innerWidth,
      radius: getComputedStyle(sheet).borderRadius
    };
  });

  await page.locator('[data-action="connect-qr"]').click();
  await expect(page.locator("[data-qr-sheet]")).toBeVisible();
  await page.waitForTimeout(450);
  const qrSheet = await measureSheet("[data-qr-sheet]");
  await page.locator("[data-qr-sheet] [data-action='close-qr-sheet']").click();

  await page.locator('[data-action="connect-nearby"]').click();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 7000 });
  await page.locator('[data-action="open-receive-sheet"]').click();
  await expect(page.locator("[data-receive-sheet]")).toBeVisible();
  await page.waitForTimeout(450);
  const receiveSheet = await measureSheet("[data-receive-sheet]");

  for (const geometry of [qrSheet, receiveSheet]) {
    expect(geometry.left).toBe(0);
    expect(geometry.right).toBe(0);
    expect(geometry.bottom).toBe(0);
    expect(geometry.width).toBe(geometry.viewport);
    expect(geometry.radius).toBe("30px 30px 0px 0px");
  }
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
      Number.parseFloat(getComputedStyle(document.querySelector(`.orbit-ring--${name}`)).width) * .47
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
        peerContain: peerStyle.contain,
        peerWillChange: peerStyle.willChange,
        ringWillChange: ringStyle.willChange,
        peerTransform: peerStyle.transform
      }
    };
  });

  expect(geometry.minimumClearance).toBeGreaterThanOrEqual(8);
  expect(Math.max(...geometry.radiusErrors)).toBeLessThanOrEqual(1.5);
  expect(geometry.compositor.sceneContain).toBe("style");
  expect(geometry.compositor.peerContain).toBe("style");
  expect(geometry.compositor.peerWillChange).toContain("transform");
  expect(geometry.compositor.ringWillChange).toContain("transform");
  expect(geometry.compositor.peerTransform).not.toBe("none");
});

test("anchors the connected dock to a tall viewport instead of the orbit scene", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Tall resizable viewport geometry is validated once in Chromium.");
  await page.setViewportSize({ width: 400, height: 970 });
  await page.addInitScript(() => {
    localStorage.setItem("webdrop.motionPaused", "true");
  });
  await page.goto("/?qa=e2e-tall-connected-layout&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });
  await page.locator('[data-action="connect-nearby"]').click();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "connected", { timeout: 7000 });
  await page.waitForTimeout(400);

  const geometry = await page.evaluate(() => {
    const orbit = document.querySelector(".orbit-scene").getBoundingClientRect();
    const tray = document.querySelector(".connection-tray").getBoundingClientRect();
    return {
      trayBottomGap: Math.round(window.innerHeight - tray.bottom),
      orbitToTrayGap: Math.round(tray.top - orbit.bottom),
      trayOffsetParent: document.querySelector(".connection-tray").offsetParent?.className || null
    };
  });

  expect(geometry.trayBottomGap).toBeGreaterThanOrEqual(17);
  expect(geometry.trayBottomGap).toBeLessThanOrEqual(19);
  expect(geometry.orbitToTrayGap).toBeGreaterThan(100);
  expect(geometry.trayOffsetParent).toBeNull();
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

test("keeps the expanded mobile island edge-to-edge with a centered Canvas2D wave", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-iphone-15-pro", "Expanded island geometry is mobile-specific.");
  await page.goto("/?qa=e2e-full-width-island&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });

  await page.evaluate(async () => {
    const { DynamicIsland } = await import("/js/ui/dynamic-island.js?v=e2e-full-width-island");
    const island = new DynamicIsland(document, (key) => key);
    island.showAnonymousConnectionProgress({
      id: "self",
      name: "WebDrop Device",
      avatar: "assets/icons/avatars/user-01.png"
    });
  });
  await expect(page.locator("[data-dynamic-island]")).toHaveAttribute("data-state", "connecting");
  await expect(page.locator("[data-island-peer-avatar]")).toHaveAttribute("data-anonymous", "true");
  await expect(page.locator("[data-island-peer-avatar] img")).toHaveCount(0);
  await page.waitForTimeout(650);

  const geometry = await page.evaluate(() => {
    const island = document.querySelector("[data-dynamic-island]").getBoundingClientRect();
    const flow = document.querySelector(".webdrop-island__flow").getBoundingClientRect();
    const wave = document.querySelector("[data-island-wave]");
    return {
      leftGap: Math.round(island.left),
      rightGap: Math.round(window.innerWidth - island.right),
      width: Math.round(island.width),
      viewport: window.innerWidth,
      waveCenterOffset: Math.round((flow.left + flow.width / 2 - window.innerWidth / 2) * 10) / 10,
      renderer: wave.dataset.waveRenderer,
      radius: getComputedStyle(document.querySelector("[data-dynamic-island]")).borderRadius
    };
  });

  expect(geometry.leftGap).toBe(0);
  expect(geometry.rightGap).toBe(0);
  expect(geometry.width).toBe(geometry.viewport);
  expect(Math.abs(geometry.waveCenterOffset)).toBeLessThanOrEqual(.5);
  expect(geometry.renderer).toBe("canvas2d");
  expect(geometry.radius).toBe("0px 0px 34px 34px");
});

test("shows acoustic slot diagnostics in the Dynamic Island ceremony", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Slot diagnostic text is covered once in Chromium.");
  await page.goto("/?qa=e2e-acoustic-diagnostics&runtime=mock", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toHaveAttribute("data-ready", "true", { timeout: 7000 });

  await page.evaluate(async () => {
    const { DynamicIsland } = await import("/js/ui/dynamic-island.js?v=e2e-acoustic-diagnostics");
    const messages = {
      ceremonyAudioEmitting: "Emitting",
      ceremonyAudioEmitted: "Emitted",
      ceremonyAudioEmitFailed: "Emit failed",
      ceremonyAudioListening: "Listening",
      ceremonyDetected: "Detected",
      ceremonyMissed: "Missed",
      ceremonyAudioSending: "Listening"
    };
    const island = new DynamicIsland(document, (key) => messages[key] || key);
    island.showAnonymousConnectionProgress({
      id: "self",
      name: "WebDrop Device",
      avatar: "assets/icons/avatars/user-01.png"
    });
    globalThis.__webdropDiagnosticIsland = island;
    island.updateCeremony({
      phase: "audio",
      state: "active",
      acoustic: {
        mode: "detected",
        detected: true,
        slot: 2,
        slotCount: 4,
        marginDb: 31,
        startFrequencyHz: 20350,
        endFrequencyHz: 20580
      }
    });
  });

  await expect(page.locator("[data-island-audio-value]")).toHaveText("Detected 2/4 +31dB 20.4-20.6kHz");
  const audioValueStyle = await page.locator("[data-island-audio-value]").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      height: Math.round(node.getBoundingClientRect().height)
    };
  });
  expect(audioValueStyle.whiteSpace).not.toBe("nowrap");
  expect(audioValueStyle.textOverflow).not.toBe("ellipsis");
  expect(audioValueStyle.height).toBeGreaterThan(10);

  await page.evaluate(() => {
    globalThis.__webdropDiagnosticIsland.updateCeremony({
      phase: "audio",
      state: "failed",
      acoustic: {
        mode: "missed",
        detected: false,
        missedCount: 2,
        slotCount: 3,
        startFrequencyHz: 20350,
        endFrequencyHz: 20880
      }
    });
  });
  await expect(page.locator("[data-island-audio-value]")).toHaveText("Missed 2 slots 20.4-20.9kHz");
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

test("defers desktop receive chunks in IndexedDB until Download", async ({ page }, testInfo) => {
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

test("opens a received file in a new tab on iPhone WebKit without leaving WebDrop", async ({ page }, testInfo) => {
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
  const viewAction = page.locator("[data-received-list] [data-action='open-received'][data-received-intent='view']");
  const downloadAction = page.locator("[data-received-list] [data-action='open-received'][data-received-intent='download']");
  await expect(viewAction).toHaveText(/View|表示/);
  await expect(downloadAction).toHaveText(/Download|ダウンロード/);
  await viewAction.click();

  await expect.poll(() => page.evaluate(() => globalThis.__webdropWindowOpenCalls.length)).toBe(1);
  const calls = await page.evaluate(() => globalThis.__webdropWindowOpenCalls);
  expect(calls[0].url).toContain("output/pdf/webdrop-demo-en.pdf");
  expect(calls[0].target).toBe("_blank");
  expect(calls[0].features).toContain("noopener");
  expect(calls[0].features).toContain("noreferrer");
  expect(calls[0].active).toBe(true);
  await expect(page.locator("[data-toast]")).toContainText(/Opened in a new tab|新しいタブで開きました/);
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
  await expect(page.locator("[data-received-list] [data-received-intent='view']").first()).toHaveText(/View|表示/);
  await expect(page.locator("[data-received-list] [data-received-intent='download']").first()).toHaveText(/Download|ダウンロード/);
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
    bar: node.querySelector("[data-island-transfer-bar]")?.style.transform,
    barTransition: getComputedStyle(node.querySelector("[data-island-transfer-bar]")).transitionTimingFunction,
    percentNumeric: getComputedStyle(node.querySelector("[data-island-transfer-percent]")).fontVariantNumeric
  }));

  expect(island.label).toMatch(/Sending|送信中/);
  expect(island.name).toContain("webdrop-transfer-proof.bin");
  expect(island.bar).toContain("scaleX");
  expect(island.barTransition).toContain("cubic-bezier");
  expect(island.percentNumeric).toContain("tabular-nums");
  expect(consoleProblems).toEqual([]);
});

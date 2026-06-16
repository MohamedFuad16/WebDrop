import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { createController } from "../js/core/controller.js";
import { createStore } from "../js/core/state.js";
import { DynamicIsland } from "../js/ui/dynamic-island.js";
import { Emitter } from "../js/utils/emitter.js";

test("connecting island stays visible for a subtle minimum interval", async () => {
  let scheduledDelay = null;
  let releaseDelay = null;
  let closeCalls = 0;
  const island = Object.assign(Object.create(DynamicIsland.prototype), {
    state: "connecting",
    connectionOpenedAt: 100,
    connectionDelayTimer: 0,
    connectionDelayResolver: null,
    now: () => 250,
    prefersReducedMotion: () => false,
    scheduleTimeout(callback, delayMs) {
      scheduledDelay = delayMs;
      releaseDelay = callback;
      return 1;
    },
    cancelTimeout() {},
    close: async () => {
      closeCalls += 1;
      return true;
    }
  });

  const finishing = island.finishConnectionTransition();
  assert.equal(scheduledDelay, 1450);
  assert.equal(closeCalls, 0);
  releaseDelay();
  assert.equal(await finishing, true);
  assert.equal(closeCalls, 1);
});

test("reduced motion keeps only a minimal connection display delay", async () => {
  let scheduledDelay = null;
  let releaseDelay = null;
  const island = Object.assign(Object.create(DynamicIsland.prototype), {
    state: "connecting",
    connectionOpenedAt: 10,
    connectionDelayTimer: 0,
    connectionDelayResolver: null,
    now: () => 30,
    prefersReducedMotion: () => true,
    scheduleTimeout(callback, delayMs) {
      scheduledDelay = delayMs;
      releaseDelay = callback;
      return 1;
    },
    cancelTimeout() {},
    close: async () => true
  });

  const finishing = island.finishConnectionTransition();
  assert.equal(scheduledDelay, 60);
  releaseDelay();
  assert.equal(await finishing, true);
});

test("canceling during the minimum display interval prevents island closure and merge", async () => {
  let closeCalls = 0;
  const island = Object.assign(Object.create(DynamicIsland.prototype), {
    state: "connecting",
    connectionOpenedAt: 0,
    connectionDelayTimer: 0,
    connectionDelayResolver: null,
    now: () => 100,
    prefersReducedMotion: () => false,
    scheduleTimeout: () => 1,
    cancelTimeout() {},
    close: async () => {
      closeCalls += 1;
      return true;
    }
  });

  const finishing = island.finishConnectionTransition();
  island.state = "closing";
  island.cancelConnectionMinimum(false);
  assert.equal(await finishing, false);
  assert.equal(closeCalls, 0);
});

test("connection waits for the sheet and island to retract before merging avatars", async () => {
  const sheetClosed = deferred();
  const ceremonyFinished = deferred();
  const islandRetracted = deferred();
  const events = [];
  const store = createStore(initialState());
  const view = fakeView({
    events,
    closePeerSheet: () => {
      events.push("sheet:closing");
      return sheetClosed.promise;
    },
    showIslandConnectionProgress: () => events.push("island:open"),
    finishIslandConnectionTransition: () => {
      events.push("island:closing");
      return islandRetracted.promise;
    },
    pulseConnectionHaptic: () => events.push("haptic:connected")
  });
  const signaling = fakeSignaling();
  const proximity = {
    runCeremony: () => ceremonyFinished.promise,
    stopMotionCapture() {},
    stopAcousticCapture() {}
  };
  const transport = {
    preflight: async () => {
      events.push("transport:ready");
      return "direct";
    }
  };

  createController({
    store,
    view,
    signaling,
    futureSignaling: signaling,
    proximity,
    transport,
    transfer: new Emitter()
  });

  view.emit("peer-select", "peer-a");
  view.emit("swipe-connect");
  await tick();
  assert.equal(store.getState().mode, "verifying");
  assert.deepEqual(events.slice(-1), ["sheet:closing"]);
  assert.equal(events.includes("island:open"), false);

  sheetClosed.resolve();
  await tick();
  assert.equal(events.includes("island:open"), true);

  ceremonyFinished.resolve({ passed: true, metrics: {}, reason: "verified" });
  await tick();
  await tick();
  assert.equal(store.getState().mode, "verifying");
  assert.equal(events.at(-1), "island:closing");

  islandRetracted.resolve(true);
  await tick();
  assert.equal(store.getState().mode, "connected");
  assert.equal(store.getState().connectedPeerId, "peer-a");
  assert.deepEqual(events.slice(-2), ["island:closing", "haptic:connected"]);
});

test("an interrupted island retraction never commits the connected state", async () => {
  const store = createStore(initialState());
  const view = fakeView({
    closePeerSheet: () => Promise.resolve(),
    finishIslandConnectionTransition: () => Promise.resolve(false)
  });
  const signaling = fakeSignaling();

  createController({
    store,
    view,
    signaling,
    futureSignaling: signaling,
    proximity: {
      runCeremony: async () => ({ passed: true, metrics: {}, reason: "verified" }),
      stopMotionCapture() {},
      stopAcousticCapture() {}
    },
    transport: { preflight: async () => "direct" },
    transfer: new Emitter()
  });

  view.emit("peer-select", "peer-a");
  view.emit("swipe-connect");
  await tick();
  await tick();
  assert.equal(store.getState().mode, "verifying");
  assert.equal(store.getState().connectedPeerId, null);
});

test("failed transport preflight resets verification state", async () => {
  const toasts = [];
  const store = createStore(initialState());
  const view = fakeView({
    closePeerSheet: () => Promise.resolve(),
    finishIslandConnectionTransition: async () => {
      throw new Error("should not retract after preflight failure");
    },
    toast: (message) => toasts.push(message)
  });
  const signaling = fakeSignaling();

  createController({
    store,
    view,
    signaling,
    futureSignaling: signaling,
    proximity: {
      runCeremony: async () => ({ passed: true, metrics: {}, reason: "verified" }),
      stopMotionCapture() {},
      stopAcousticCapture() {}
    },
    transport: { preflight: async () => { throw new Error("preflight failed"); } },
    transfer: new Emitter()
  });

  view.emit("peer-select", "peer-a");
  view.emit("swipe-connect");
  await tick();
  await tick();
  await tick();
  assert.equal(store.getState().mode, "lobby");
  assert.equal(store.getState().pendingInviteId, null);
  assert.equal(store.getState().connectedPeerId, null);
  assert.ok(toasts.includes("connectionRejected"));
});

test("terminal WebRTC failure resets verification without waiting for timeout", async () => {
  const toasts = [];
  const store = createStore(initialState());
  const view = fakeView({
    closePeerSheet: () => Promise.resolve(),
    finishIslandConnectionTransition: async () => {
      throw new Error("should not retract after transport failure");
    },
    toast: (message) => toasts.push(message)
  });
  const signaling = fakeSignaling();
  const transport = new Emitter();
  Object.assign(transport, {
    peerConnection: { connectionState: "new" },
    enable() {},
    connect: async () => {
      queueMicrotask(() => {
        transport.peerConnection.connectionState = "failed";
        transport.emit("connection-state", { state: "failed" });
      });
    },
    getPathStats: async () => ({ path: "unknown" })
  });

  createController({
    store,
    view,
    signaling,
    futureSignaling: signaling,
    proximity: {
      runCeremony: async () => ({ passed: true, metrics: {}, reason: "verified" }),
      stopMotionCapture() {},
      stopAcousticCapture() {}
    },
    transport,
    transfer: new Emitter(),
    runtime: { realTransfer: true }
  });

  view.emit("peer-select", "peer-a");
  view.emit("swipe-connect");
  await tick();
  await tick();
  await tick();
  assert.equal(store.getState().mode, "lobby");
  assert.equal(store.getState().pendingInviteId, null);
  assert.ok(toasts.includes("connectionRejected"));
});

test("send completion after disconnect does not resurrect transfer state", async () => {
  const sendFinished = deferred();
  let progress;
  const store = createStore({
    ...initialState(),
    mode: "connected",
    selectedPeerId: "peer-a",
    connectedPeerId: "peer-a",
    pairingId: "pair-peer-a",
    files: [fakeFile("demo.txt", 8)]
  });
  const view = fakeView({
    closeActionSheets: () => {
      throw new Error("should not close sheets after stale send");
    }
  });
  const signaling = fakeSignaling();
  const transfer = new Emitter();
  transfer.send = async (_files, options) => {
    progress = options.onProgress;
    await sendFinished.promise;
  };

  createController({
    store,
    view,
    signaling,
    futureSignaling: signaling,
    proximity: {
      runCeremony: async () => ({ passed: true, metrics: {}, reason: "verified" }),
      stopMotionCapture() {},
      stopAcousticCapture() {}
    },
    transport: { preflight: async () => "direct" },
    transfer
  });

  view.emit("send");
  await tick();
  assert.equal(store.getState().transfer.stage, "preparing");
  store.patch({
    mode: "lobby",
    connectedPeerId: null,
    pairingId: null,
    transfer: null,
    files: [],
    receivedItems: []
  });
  progress({ ratio: 1, transferredBytes: 8, totalBytes: 8 });
  assert.equal(store.getState().transfer, null);
  sendFinished.resolve();
  await tick();
  await tick();
  assert.deepEqual(store.getState().receivedItems, []);
  assert.equal(store.getState().transfer, null);
});

test("dynamic island refreshes live QR copy when locale changes", () => {
  let locale = "en";
  const textNode = () => ({ textContent: "" });
  const island = Object.assign(Object.create(DynamicIsland.prototype), {
    copyKeys: { title: null, status: null },
    nodes: {
      title: textNode(),
      status: textNode(),
      camera: textNode(),
      fallback: textNode()
    },
    translate: (key) => `${locale}:${key}`
  });

  island.setCopy("qrScanTitle", "qrScanStatus");
  assert.equal(island.nodes.title.textContent, "en:qrScanTitle");
  assert.equal(island.nodes.status.textContent, "en:qrScanStatus");
  locale = "ja";
  island.refreshLocale();
  assert.equal(island.nodes.title.textContent, "ja:qrScanTitle");
  assert.equal(island.nodes.status.textContent, "ja:qrScanStatus");
  assert.equal(island.nodes.camera.textContent, "ja:startCamera");
});

test("service worker cache namespace matches the application version", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(serviceWorker, new RegExp(`APP_VERSION = "${escapeRegExp(packageJson.version)}"`));
  assert.match(serviceWorker, new RegExp(`webdrop-v2-static-\\$\\{APP_VERSION\\}`));
  assert.match(serviceWorker, new RegExp(`webdrop-v2-runtime-\\$\\{APP_VERSION\\}`));
});

test("service worker precache manifest only references existing static assets", async () => {
  const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const assets = extractPrecacheAssets(serviceWorker);
  assert.equal(new Set(assets).size, assets.length);
  assert.equal(assets.includes("./js/config/runtime-config.js"), false);

  for (const asset of assets) {
    assert.match(asset, /^\.\//);
    const assetUrl = asset === "./"
      ? new URL("../", import.meta.url)
      : new URL(`../${asset.slice(2)}`, import.meta.url);
    const assetStat = await stat(assetUrl);
    assert.equal(asset === "./" ? assetStat.isDirectory() : assetStat.isFile(), true, asset);
  }
});

function initialState() {
  return {
    mode: "lobby",
    self: {
      id: "self-a",
      name: "Self",
      avatar: "assets/icons/avatars/user_1.png",
      ringColor: "#ffffff"
    },
    peers: [{
      id: "peer-a",
      name: "Peer",
      avatar: "assets/icons/avatars/user_2.png",
      stage: "lobby",
      capabilities: {}
    }],
    capabilities: {},
    selectedPeerId: null,
    pendingInviteId: null,
    connectedPeerId: null,
    pairingId: null,
    files: [],
    transfer: null,
    path: "unknown",
    receivedCount: 0,
    receivedItems: [],
    chatMessages: [],
    theme: "light",
    locale: "en",
    motionPaused: false
  };
}

function fakeView(overrides = {}) {
  const view = new Emitter();
  const noOp = () => {};
  Object.assign(view, {
    translate: (key) => key,
    openPeerSheet: noOp,
    closePeerSheet: async () => {},
    showIslandConnectionProgress: noOp,
    finishIslandConnectionTransition: async () => true,
    pulseConnectionHaptic: noOp,
    toast: noOp,
    closeDynamicIsland: noOp,
    markIslandQrSuccess: noOp,
    ...overrides
  });
  return view;
}

function fakeSignaling() {
  const signaling = new Emitter();
  Object.assign(signaling, {
    sendProximityTelemetry: async () => {},
    disconnectPeer: async () => {}
  });
  return signaling;
}

function fakeFile(name, size) {
  return {
    name,
    size,
    type: "text/plain"
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPrecacheAssets(serviceWorker) {
  const match = serviceWorker.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(match, "service-worker ASSETS array is missing");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((asset) => asset[1]);
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Emitter } from "../js/utils/emitter.js";
import {
  createChirpSamples,
  findBestCorrelation,
  normalizedCorrelation
} from "../js/services/acoustic-proximity.js";
import { vectorMagnitude, tiltFromAcceleration } from "../js/services/motion-proximity.js";
import { createQrToken, validateQrToken } from "../js/services/proximity-token.js";
import { ProximityEngine } from "../js/services/proximity-engine.js";
import { TransferEngine } from "../js/services/transfer-engine.js";
import { StorageClient } from "../js/storage/storage-client.js";
import { WebSocketSignalingAdapter } from "../js/services/websocket-signaling.js";
import { DataChannelTransferProtocol } from "../js/services/data-channel-transfer-protocol.js";
import { getRuntimeFlags } from "../js/config/runtime-flags.js";

test("package metadata, lockfile, and verification scripts stay in sync", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lockJson = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(packageJson.version, "1.0.12");
  assert.equal(lockJson.version, packageJson.version);
  assert.equal(lockJson.packages[""].version, packageJson.version);
  assert.deepEqual(lockJson.packages[""].dependencies, packageJson.dependencies);
  assert.equal(packageJson.scripts.check, "node scripts/check-js.mjs");
  assert.equal(packageJson.scripts.test, "node --test test/*.test.js");
  assert.equal(packageJson.scripts["audit:secrets"], "node scripts/check-js.mjs --secrets-only");
  assert.equal(packageJson.scripts.verify, "npm run check && npm test");
  assert.match(packageJson.scripts["verify:full"], /aws cloud server/);
  assert.match(packageJson.scripts["verify:full"], /npm audit --omit=dev/);
});

test("service worker updates activate promptly and navigation bypasses stale shell cache", async () => {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(source, /self\.skipWaiting\(\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
  assert.match(source, /event\.request\.mode === "navigate"/);
  assert.match(source, /fetch\(event\.request, \{ cache: "no-store" \}\)/);
  assert.match(appSource, /controllerchange/);
  assert.match(appSource, /registration\.update\(\)/);
});

test("orbit peers avoid duplicate rings and App Information exposes QR preview", async () => {
  const orbitCss = await readFile(new URL("../css/orbit.css", import.meta.url), "utf8");
  const islandCss = await readFile(new URL("../css/dynamic-island.css", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const viewSource = await readFile(new URL("../js/ui/app-view.js", import.meta.url), "utf8");

  assert.match(orbitCss, /\.peer-node button[\s\S]*?background: transparent;/);
  assert.match(orbitCss, /--connected-ring-four-size: calc\(var\(--connected-avatar\) \* 2\.72\);/);
  assert.match(orbitCss, /\.peer-node img,[\s\S]*?\.peer-node \.avatar-animation[\s\S]*?border: 3px solid #ffffff;[\s\S]*?background: #ffffff;/);
  assert.doesNotMatch(orbitCss, /\.peer-node button::before/);
  assert.match(islandCss, /\.webdrop-island\[data-state="closing"\][\s\S]*?width: 126px;[\s\S]*?height: 36px;/);
  assert.match(islandCss, /opacity 220ms ease 80ms/);
  assert.match(islandCss, /\.webdrop-island\[data-state="closing"\] \.webdrop-island__pill,[\s\S]*?\.webdrop-island\[data-state="closing"\] \.webdrop-island__cancel/);
  assert.match(html, /data-action="toggle-qr-preview"/);
  assert.match(html, /role="switch"[\s\S]*?data-qr-preview-toggle/);
  assert.doesNotMatch(html, /data-island-fallback/);
  assert.doesNotMatch(html, /\s+switch(\s|>)/);
  assert.match(viewSource, /toggleQrScannerPreview\(\)/);
  assert.match(viewSource, /closeQrScannerPreview\(\)/);
});

test("nearby directory caps orbit peers and exposes searchable overflow", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const viewSource = await readFile(new URL("../js/ui/app-view.js", import.meta.url), "utf8");
  const mockSource = await readFile(new URL("../js/services/mock-signaling.js", import.meta.url), "utf8");
  const sheetsCss = await readFile(new URL("../css/sheets.css", import.meta.url), "utf8");
  const connectedCss = await readFile(new URL("../css/connected.css", import.meta.url), "utf8");

  assert.match(viewSource, /const ORBIT_PEER_LIMIT = 12/);
  assert.match(viewSource, /rankPeersForDisplay\(state\.peers, state\)/);
  assert.match(viewSource, /rankPeersForDisplay\(peers, state\)/);
  assert.match(viewSource, /matchesNearbyFilter\(peer, state, this\.nearbyFilter\)/);
  assert.match(html, /data-action="open-nearby-sheet"/);
  assert.match(html, /data-nearby-overflow-count/);
  assert.match(html, /data-nearby-search/);
  assert.match(html, /data-nearby-filter="recent"/);
  assert.match(html, /data-nearby-filter="same-device"/);
  assert.match(sheetsCss, /\.nearby-device-row/);
  assert.match(sheetsCss, /\.nearby-device-avatar\s*\{[\s\S]*?overflow: hidden;/);
  assert.match(sheetsCss, /\.nearby-device-avatar img,\s*[\s\S]*?\.nearby-device-avatar \.avatar-static\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(connectedCss, /\.nearby-fab/);
  assert.match(viewSource, /sheet\.classList\.add\("is-open"\);\s*sheet\.style\.opacity = "1";/);
  assert.ok((mockSource.match(/id: "peer-/g) || []).length >= 13);
});

test("modal controls are keyboard-safe while sheets and Dynamic Island animate", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const sheetsCss = await readFile(new URL("../css/sheets.css", import.meta.url), "utf8");
  const viewSource = await readFile(new URL("../js/ui/app-view.js", import.meta.url), "utf8");
  const islandSource = await readFile(new URL("../js/ui/dynamic-island.js", import.meta.url), "utf8");

  assert.match(html, /data-send-swipe-thumb/);
  assert.match(viewSource, /setSendSwipeReady\(ready\)/);
  assert.match(viewSource, /sendSwipeThumb\.disabled = !ready/);
  assert.match(viewSource, /sendSwipeThumb\.tabIndex = ready \? 0 : -1/);
  assert.match(viewSource, /setSheetBackgroundInert\(true\)/);
  assert.match(viewSource, /if \(shouldRestoreBackground\) this\.setSheetBackgroundInert\(false\)/);
  assert.match(viewSource, /sheet\.contains\(active\)/);
  assert.match(viewSource, /if \(!sheet\.contains\(active\)\)/);
  assert.match(sheetsCss, /\.field input:focus-visible/);
  assert.match(islandSource, /const concealed = state === "closed" \|\| state === "closing"/);
  assert.match(islandSource, /document\.activeElement\.blur/);
  assert.match(islandSource, /event\.key === "Tab" && this\.state\.startsWith\("qr-"\)/);
});

test("avatar picker uses button-group semantics instead of incomplete listbox behavior", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const viewSource = await readFile(new URL("../js/ui/app-view.js", import.meta.url), "utf8");

  assert.match(html, /data-avatar-carousel role="group"/);
  assert.doesNotMatch(viewSource, /role="option"/);
  assert.match(viewSource, /aria-pressed/);
  assert.doesNotMatch(viewSource, /aria-selected/);
});

test("generated outputs, dependency folders, and local secrets are ignored", async () => {
  const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  for (const pattern of [
    ".env",
    ".env.*",
    "node_modules/",
    "test-results/",
    "tmp/",
    "graphify-out/cache/ast/*.json",
    "npm-debug.log*"
  ]) {
    assert.ok(gitignore.includes(pattern), `${pattern} must stay ignored`);
  }

  const attributes = await readFile(new URL("../.gitattributes", import.meta.url), "utf8");
  for (const pattern of ["*.pdf binary", "*.png binary", "*.zip binary"]) {
    assert.ok(attributes.includes(pattern), `${pattern} must stay marked binary`);
  }
});

test("real proximity orchestration remains disabled by default", async () => {
  const engine = new ProximityEngine();
  const result = await engine.runRealCeremony();
  assert.equal(result.reason, "disabled");
  assert.equal(result.passed, false);
});

test("chirp correlation identifies the generated acoustic template", () => {
  const template = createChirpSamples(48000);
  const samples = new Float32Array(template.length + 120);
  samples.set(template, 60);
  assert.ok(normalizedCorrelation(samples, template, 60) > 0.99);
  const best = findBestCorrelation(samples, template);
  assert.equal(best.offset, 60);
  assert.ok(best.correlation > 0.99);
});

test("motion helpers detect meaningful acceleration and tilt", () => {
  assert.equal(vectorMagnitude({ x: 3, y: 4, z: 0 }), 5);
  const tilt = tiltFromAcceleration({ x: 9.8, y: 0, z: 0 });
  assert.ok(Math.abs(tilt.gamma) > 80);
});

test("frontend QR token is session-bound and expires", () => {
  const token = createQrToken({ sessionId: "session-a", now: 1000, ttlMs: 1000, nonce: "nonce" });
  assert.equal(validateQrToken(token, { sessionId: "session-a", now: 1500 }).valid, true);
  assert.equal(validateQrToken(token, { sessionId: "session-b", now: 1500 }).valid, false);
  assert.equal(validateQrToken(token, { sessionId: "session-a", now: 8000 }).valid, false);
});

test("production WebSocket signaling stays unconfigured without a URL", async () => {
  const adapter = new WebSocketSignalingAdapter();
  assert.equal(await adapter.connect({ self: { id: "test" } }), false);
});

test("production runtime dependencies remain disabled without a real signaling URL", () => {
  const previousConfig = globalThis.WEBDROP_RUNTIME_CONFIG;
  const previousLocation = globalThis.location;
  globalThis.location = new URL("https://webdrop.example.test/");
  globalThis.WEBDROP_RUNTIME_CONFIG = {
    productionSignaling: true,
    realProximityCeremony: true,
    realTransfer: true
  };
  const flags = getRuntimeFlags();
  assert.equal(flags.productionSignaling, false);
  assert.equal(flags.realProximityCeremony, false);
  assert.equal(flags.realTransfer, false);
  globalThis.WEBDROP_RUNTIME_CONFIG = previousConfig;
  globalThis.location = previousLocation;
});

test("production signaling only enables for websocket URLs", () => {
  const previousConfig = globalThis.WEBDROP_RUNTIME_CONFIG;
  const previousLocation = globalThis.location;
  globalThis.location = new URL("https://webdrop.example.test/");
  globalThis.WEBDROP_RUNTIME_CONFIG = {
    productionSignaling: true,
    realProximityCeremony: true,
    realTransfer: true,
    qrPairing: true,
    signalingUrl: "https://webdrop.example.test/signaling",
    turnConfigUrl: "/turn"
  };
  let flags = getRuntimeFlags();
  assert.equal(flags.productionSignaling, false);
  assert.equal(flags.signalingUrl, "");
  assert.equal(flags.turnConfigUrl, "https://webdrop.example.test/turn");

  globalThis.WEBDROP_RUNTIME_CONFIG.signalingUrl = "wss://webdrop.example.test/signaling";
  flags = getRuntimeFlags();
  assert.equal(flags.productionSignaling, true);
  assert.equal(flags.realProximityCeremony, true);
  assert.equal(flags.realTransfer, true);
  assert.equal(flags.qrPairing, true);
  globalThis.WEBDROP_RUNTIME_CONFIG = previousConfig;
  globalThis.location = previousLocation;
});

test("data channel sender hashes files and waits for receiver completion verification", async () => {
  const control = fakeDataChannel("webdrop-control-v1");
  const file = fakeDataChannel("webdrop-file-v1");
  const protocol = new DataChannelTransferProtocol({ controlChannel: control, fileChannel: file });
  const source = Object.assign(new Blob(["hello"]), {
    name: "hello.txt",
    lastModified: 1
  });
  const sending = protocol.sendFiles([source], { transferId: "tx-hash" });
  while (!control.sent.some((message) => String(message).includes("transfer:manifest"))) await tick();
  await protocol.handleControlMessage(JSON.stringify({
    type: "transfer:ready",
    transferId: "tx-hash"
  }));
  while (!control.sent.some((message) => String(message).includes("transfer:complete"))) await tick();
  const manifestMessage = JSON.parse(control.sent.find((message) => String(message).includes("transfer:manifest")));
  assert.match(manifestMessage.manifest.files[0].sha256, /^[a-f0-9]{64}$/);
  await protocol.handleControlMessage(JSON.stringify({
    type: "transfer:ack",
    transferId: "tx-hash",
    stage: "complete",
    receivedBytes: 5
  }));
  assert.equal((await sending).id, "tx-hash");
});

test("data channel sender aborts while waiting for receiver readiness", async () => {
  const control = fakeDataChannel("webdrop-control-v1");
  const file = fakeDataChannel("webdrop-file-v1");
  const protocol = new DataChannelTransferProtocol({ controlChannel: control, fileChannel: file });
  const source = Object.assign(new Blob(["hold"]), {
    name: "hold.txt",
    lastModified: 1
  });
  const controller = new AbortController();
  const sending = protocol.sendFiles([source], {
    transferId: "tx-abort-ready",
    signal: controller.signal
  });
  while (!control.sent.some((message) => String(message).includes("transfer:manifest"))) await tick();
  controller.abort();
  await assert.rejects(sending, { name: "AbortError" });
  assert.ok(control.sent.some((message) =>
    String(message).includes('"type":"transfer:cancel"')
      && String(message).includes("tx-abort-ready")
  ));
});

test("data channel receiver clears incoming state after completion", async () => {
  const control = fakeDataChannel("webdrop-control-v1");
  const file = fakeDataChannel("webdrop-file-v1");
  const protocol = new DataChannelTransferProtocol({ controlChannel: control, fileChannel: file });
  await protocol.handleControlMessage(JSON.stringify({
    type: "transfer:manifest",
    manifest: {
      version: 1,
      id: "rx-clean",
      totalBytes: 0,
      files: [{
        id: "file-empty",
        name: "empty.txt",
        size: 0,
        type: "text/plain",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }]
    }
  }));
  assert.equal(protocol.incoming.has("rx-clean"), true);
  await protocol.handleControlMessage(JSON.stringify({
    type: "transfer:complete",
    transferId: "rx-clean",
    totalBytes: 0
  }));
  assert.equal(protocol.incoming.has("rx-clean"), false);
});

test("receiver progress survives transferring a chunk buffer into storage worker ownership", async () => {
  const control = fakeDataChannel("webdrop-control-v1");
  const file = fakeDataChannel("webdrop-file-v1");
  const protocol = new DataChannelTransferProtocol({ controlChannel: control, fileChannel: file });
  protocol.setChunkHandler(({ data }) => {
    structuredClone(data, { transfer: [data] });
  });
  await protocol.handleControlMessage(JSON.stringify({
    type: "transfer:manifest",
    manifest: {
      version: 1,
      id: "rx-detach",
      totalBytes: 4,
      files: [{ id: "file-a", name: "a.bin", size: 4, type: "application/octet-stream", sha256: "a".repeat(64) }]
    }
  }));
  await protocol.handleFileMessage(JSON.stringify({
    type: "file:chunk",
    transferId: "rx-detach",
    fileId: "file-a",
    sequence: 0,
    offset: 0,
    size: 4,
    final: true
  }));
  await protocol.handleFileMessage(new Uint8Array([1, 2, 3, 4]).buffer);
  assert.equal(protocol.incoming.get("rx-detach").receivedBytes, 4);
  assert.ok(control.sent.some((message) => String(message).includes('"receivedBytes":4')));
});

test("data channel requests retry when a chunk header is orphaned", async () => {
  const control = fakeDataChannel("webdrop-control-v1");
  const file = fakeDataChannel("webdrop-file-v1");
  const protocol = new DataChannelTransferProtocol({ controlChannel: control, fileChannel: file });
  await protocol.handleControlMessage(JSON.stringify({
    type: "transfer:manifest",
    manifest: {
      version: 1,
      id: "rx-stale-header",
      totalBytes: 8,
      files: [{ id: "file-a", name: "a.bin", size: 8, type: "application/octet-stream", sha256: "a".repeat(64) }]
    }
  }));
  await protocol.handleFileMessage(JSON.stringify({
    type: "file:chunk",
    transferId: "rx-stale-header",
    fileId: "file-a",
    sequence: 0,
    offset: 0,
    size: 4,
    final: false
  }));
  await protocol.handleFileMessage(JSON.stringify({
    type: "file:chunk",
    transferId: "rx-stale-header",
    fileId: "file-a",
    sequence: 1,
    offset: 0,
    size: 4,
    final: false
  }));
  assert.ok(control.sent.some((message) =>
    String(message).includes('"type":"transfer:retry"')
      && String(message).includes("Chunk payload was not received")
  ));
});

test("storage client stays disabled until production transfer is enabled", async () => {
  const worker = fakeWorker();
  const storage = new StorageClient(worker);
  const result = await storage.prepareSession({ id: "disabled-session", expectedBytes: 10 });
  assert.equal(result.enabled, false);
  assert.equal(worker.messages.length, 0);
});

test("storage worker refuses unsafe OPFS fallback after bytes have been written", async () => {
  const workerSource = await readFile(new URL("../workers/storage-worker.js", import.meta.url), "utf8");
  assert.match(workerSource, /OPFS_FALLBACK_UNSAFE/);
  assert.match(workerSource, /receivedBytes > 0 \|\| file\.chunkCount > 0/);
  assert.match(workerSource, /restart the receive session/);
});

test("storage client transfers sliced typed arrays without detaching unrelated bytes", async () => {
  const worker = respondingWorker((message, transfer) => ({
    id: message.id,
    ok: true,
    payload: {
      byteLength: message.payload.data.byteLength,
      transferCount: transfer.length
    }
  }));
  const storage = new StorageClient(worker, { enabled: true });
  const source = new Uint8Array([9, 1, 2, 3, 4, 9]);
  const view = source.subarray(1, 5);
  const result = await storage.writeChunk(view, {
    sessionId: "slice-session",
    fileId: "file-a",
    index: 0,
    byteLength: 4,
    transfer: true
  });
  assert.equal(result.byteLength, 4);
  assert.equal(result.transferCount, 1);
  assert.notEqual(worker.messages[0].message.payload.data, source.buffer);
  assert.equal(source.byteLength, 6);
  assert.deepEqual([...source], [9, 1, 2, 3, 4, 9]);
});

test("transfer engine persists incoming chunks and finalizes receive sessions when enabled", async () => {
  const transport = new Emitter();
  transport.cancelTransfer = () => {};
  transport.retryTransfer = () => {};
  transport.setChunkHandler = (handler) => { transport.chunkHandler = handler; };
  const calls = [];
  const storage = {
    setEnabled(value) { calls.push(["enabled", value]); },
    estimateQuota(bytes) { calls.push(["quota", bytes]); return Promise.resolve({ available: bytes + 1 }); },
    prepareSession(session) { calls.push(["session", session]); return Promise.resolve({ sessionId: session.id }); },
    prepareFile(file) { calls.push(["file", file]); return Promise.resolve(file); },
    writeChunk(data, options) { calls.push(["chunk", data.byteLength, options]); return Promise.resolve({ receivedBytes: data.byteLength }); },
    finalize(options) {
      calls.push(["finalize", options]);
      return Promise.resolve({
        sessionId: options.sessionId,
        files: [{ fileId: "file-a", name: "demo.txt", receivedBytes: 4, type: "text/plain" }]
      });
    },
    abort() { return Promise.resolve(); }
  };
  const engine = new TransferEngine({ transport, storage, enabled: true });
  const received = new Promise((resolve) => engine.on("received", resolve));
  transport.emit("manifest", {
    id: "transfer-a",
    totalBytes: 4,
    createdAt: new Date().toISOString(),
    files: [{ id: "file-a", name: "demo.txt", type: "text/plain", size: 4 }]
  });
  await tick();
  await transport.chunkHandler({
    transferId: "transfer-a",
    fileId: "file-a",
    offset: 0,
    size: 4,
    data: new Uint8Array([1, 2, 3, 4]).buffer
  });
  transport.emit("complete", { transferId: "transfer-a", local: false });
  assert.equal((await received).sessionId, "transfer-a");
  assert.ok(calls.some(([type]) => type === "chunk"));
  assert.ok(calls.some(([type]) => type === "finalize"));
});

function fakeWorker() {
  return {
    messages: [],
    addEventListener() {},
    postMessage(message) {
      this.messages.push(message);
    }
  };
}

function respondingWorker(respond) {
  const listeners = new Map();
  return {
    messages: [],
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    postMessage(message, transfer = []) {
      this.messages.push({ message, transfer });
      queueMicrotask(() => {
        listeners.get("message")?.({ data: respond(message, transfer) });
      });
    }
  };
}

function fakeDataChannel(label) {
  const target = new EventTarget();
  target.label = label;
  target.readyState = "open";
  target.bufferedAmount = 0;
  target.sent = [];
  target.send = (value) => target.sent.push(value);
  target.close = () => {};
  return target;
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import WebSocket from "ws";
import { createWebDropServer } from "../src/server.js";

let server;
let hub;
let baseUrl;

beforeEach(async () => {
  await restartServer();
});

async function restartServer(envOverrides = {}) {
  if (hub) hub.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  const created = createWebDropServer({
    env: {
      HOST: "127.0.0.1",
      PORT: "0",
      ALLOW_STUN_FALLBACK: "true",
      MAX_JSON_BYTES: "2048",
      HEARTBEAT_INTERVAL_MS: "10000",
      ALLOWED_ORIGINS: "http://allowed.example",
      REQUIRE_TURN_AUTH: "false",
      ...envOverrides
    },
    logger: silentLogger()
  });
  server = created.server;
  hub = created.hub;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  hub?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("healthz and fallback ice server endpoints work", async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const ice = await fetch(`${baseUrl}/api/ice-servers?clientId=test-user`);
  const body = await ice.json();
  assert.equal(ice.status, 200);
  assert.ok(Array.isArray(body.iceServers));
  assert.match(body.iceServers[0].urls[0], /^stun:/);
});

test("TURN credentials require a live signaling session when authentication is enabled", async () => {
  await restartServer({ REQUIRE_TURN_AUTH: "true" });
  const unauthorized = await fetch(`${baseUrl}/api/ice-servers?clientId=turn-user`, {
    headers: { Origin: "http://allowed.example" }
  });
  assert.equal(unauthorized.status, 401);

  const client = await connectClient("turn-user", "TURN User");
  const connected = await client.nextOfType("connected");
  const authorized = await fetch(`${baseUrl}/api/ice-servers?clientId=turn-user`, {
    headers: {
      Origin: "http://allowed.example",
      Authorization: `Bearer ${connected.payload.turnAccessToken}`
    }
  });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers.get("access-control-allow-origin"), "http://allowed.example");
  client.close();
});

test("replacing a signaling session invalidates the old TURN bearer without removing the new client", async () => {
  await restartServer({ REQUIRE_TURN_AUTH: "true" });
  const first = await connectClient("turn-reconnect", "First Session");
  const firstConnected = await first.nextOfType("connected");
  const second = await connectClient("turn-reconnect", "Second Session");
  const secondConnected = await second.nextOfType("connected");
  assert.notEqual(firstConnected.payload.turnAccessToken, secondConnected.payload.turnAccessToken);

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(hub.clients.get("turn-reconnect")?.deviceName, "Second Session");
  assert.equal(hub.clients.size, 1);

  const stale = await fetch(`${baseUrl}/api/ice-servers?clientId=turn-reconnect`, {
    headers: {
      Origin: "http://allowed.example",
      Authorization: `Bearer ${firstConnected.payload.turnAccessToken}`
    }
  });
  assert.equal(stale.status, 401);

  const current = await fetch(`${baseUrl}/api/ice-servers?clientId=turn-reconnect`, {
    headers: {
      Origin: "http://allowed.example",
      Authorization: `Bearer ${secondConnected.payload.turnAccessToken}`
    }
  });
  assert.equal(current.status, 200);
  first.close();
  second.close();
});

test("routes invite, rtc signals, chat, transfer manifest, and disconnect between two clients", async () => {
  const alice = await connectClient("alice", "Alice Phone");
  const bob = await connectClient("bob", "Bob Tablet");

  alice.sendJson({ type: "invite", targetId: "bob", payload: { note: "nearby" } });
  const invite = await bob.nextOfType("invite");
  assert.equal(invite.payload.fromId, "alice");

  bob.sendJson({ type: "invite:accept", targetId: "alice", pairingId: invite.payload.pairingId });
  const accepted = await alice.nextOfType("invite:accept");
  assert.equal(accepted.payload.fromId, "bob");
  const acceptorConfirmation = await bob.nextOfType("invite:accept");
  assert.equal(acceptorConfirmation.payload.fromId, "alice");

  alice.sendJson({
    type: "proximity:fallback",
    targetId: "bob",
    pairingId: accepted.payload.pairingId
  });
  assert.equal((await bob.nextOfType("proximity:fallback")).payload.fromId, "alice");

  alice.sendJson({
    type: "rtc:signal",
    targetId: "bob",
    pairingId: accepted.payload.pairingId,
    signal: { type: "offer", sdp: "v=0" }
  });
  assert.equal((await bob.nextOfType("rtc:signal")).payload.signal.type, "offer");

  alice.sendJson({
    type: "rtc:path-metric",
    targetId: "bob",
    pairingId: accepted.payload.pairingId,
    payload: { path: "direct", rttMs: 18, bytesSent: 128, bytesReceived: 64 }
  });
  assert.equal((await bob.nextOfType("rtc:path-metric")).payload.payload.path, "direct");

  alice.sendJson({
    type: "proximity:qr:issue",
    targetId: "bob",
    pairingId: accepted.payload.pairingId
  });
  const issuedQr = await alice.nextOfType("proximity:qr:issued");
  assert.ok(issuedQr.payload.token);

  bob.sendJson({
    type: "proximity:qr:verify",
    targetId: "alice",
    pairingId: accepted.payload.pairingId,
    payload: { token: issuedQr.payload.token }
  });
  assert.equal((await bob.nextOfType("proximity:qr:verified")).payload.valid, true);

  alice.sendJson({
    type: "chat:message",
    targetId: "bob",
    pairingId: accepted.payload.pairingId,
    payload: { text: "hello over signaling" }
  });
  assert.equal((await bob.nextOfType("chat:message")).payload.payload.text, "hello over signaling");

  alice.sendJson({
    type: "transfer:manifest",
    targetId: "bob",
    pairingId: accepted.payload.pairingId,
    payload: {
      transferId: "tx-1",
      totalBytes: 12,
      chunkSize: 65536,
      files: [{ id: "f-1", name: "demo.pdf", type: "application/pdf", size: 12, chunks: 1 }]
    }
  });
  assert.equal((await bob.nextOfType("transfer:manifest")).payload.payload.files[0].name, "demo.pdf");

  bob.sendJson({ type: "peer:disconnect", targetId: "alice", pairingId: accepted.payload.pairingId });
  assert.equal((await alice.nextOfType("peer:disconnect")).payload.fromId, "bob");
  assert.equal((await alice.nextOfType("peer:disconnected")).payload.peerId, "bob");

  alice.close();
  bob.close();
});

test("rejects protected messages before an accepted pair exists", async () => {
  const alice = await connectClient("alice-unpaired", "Alice Phone");
  const bob = await connectClient("bob-unpaired", "Bob Tablet");

  alice.sendJson({
    type: "chat:message",
    targetId: "bob-unpaired",
    payload: { text: "not paired yet" }
  });

  const error = await alice.nextOfType("route:error");
  assert.equal(error.payload.code, "pair_required");
  assert.equal(error.payload.type, "chat:message");

  alice.close();
  bob.close();
});

test("rejects malformed RTC signal variants before routing", async () => {
  const alice = await connectClient("alice-invalid-rtc", "Alice Phone");
  const bob = await connectClient("bob-invalid-rtc", "Bob Tablet");
  alice.sendJson({ type: "invite", targetId: "bob-invalid-rtc" });
  const invite = await bob.nextOfType("invite");
  bob.sendJson({ type: "invite:accept", targetId: "alice-invalid-rtc", pairingId: invite.payload.pairingId });
  const accepted = await alice.nextOfType("invite:accept");

  alice.sendJson({
    type: "rtc:signal",
    targetId: "bob-invalid-rtc",
    pairingId: accepted.payload.pairingId,
    signal: { type: "unsupported", payload: "nope" }
  });
  const error = await alice.nextOfType("protocol:error");
  assert.equal(error.payload.code, "invalid_rtc_signal");

  alice.close();
  bob.close();
});

test("coordinates proximity start and gates connected features until both peers verify", async () => {
  await restartServer({ ENABLE_PROXIMITY_ANALYSIS: "true" });
  const alice = await connectClient("alice-gated", "Alice Phone");
  const bob = await connectClient("bob-gated", "Bob Tablet");
  alice.sendJson({ type: "invite", targetId: "bob-gated" });
  const invite = await bob.nextOfType("invite");
  bob.sendJson({ type: "invite:accept", targetId: "alice-gated", pairingId: invite.payload.pairingId });
  const accepted = await alice.nextOfType("invite:accept");
  const pairingId = accepted.payload.pairingId;

  alice.sendJson({ type: "proximity:ready", targetId: "bob-gated", pairingId });
  bob.sendJson({ type: "proximity:ready", targetId: "alice-gated", pairingId });
  const [aliceStart, bobStart] = await Promise.all([
    alice.nextOfType("proximity:start"),
    bob.nextOfType("proximity:start")
  ]);
  assert.equal(aliceStart.payload.startAt, bobStart.payload.startAt);

  const gatedAt = Date.now();
  alice.sendJson({
    type: "chat:message",
    targetId: "bob-gated",
    pairingId,
    payload: { text: "too early" }
  });
  assert.equal((await alice.nextOfType("route:error", { after: gatedAt })).payload.code, "proximity_not_verified");

  const metrics = {
    soundCorrelation: 0.9,
    motionCorrelation: 1,
    bumpCorrelation: 1,
    tiltMatch: 1
  };
  const verifiedAt = Date.now();
  alice.sendJson({ type: "proximity:telemetry", targetId: "bob-gated", pairingId, metrics });
  bob.sendJson({ type: "proximity:telemetry", targetId: "alice-gated", pairingId, metrics });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(hub.isProximityVerified(pairingId), true);

  alice.sendJson({
    type: "chat:message",
    targetId: "bob-gated",
    pairingId,
    payload: { text: "verified" }
  });
  assert.equal((await bob.nextOfType("chat:message", { after: verifiedAt })).payload.payload.text, "verified");
  alice.close();
  bob.close();
});

test("QR verification can satisfy the proximity gate for paired devices", async () => {
  await restartServer({ ENABLE_PROXIMITY_ANALYSIS: "true" });
  const alice = await connectClient("alice-qr-gated", "Alice Phone");
  const bob = await connectClient("bob-qr-gated", "Bob Tablet");
  alice.sendJson({ type: "invite", targetId: "bob-qr-gated" });
  const invite = await bob.nextOfType("invite");
  bob.sendJson({ type: "invite:accept", targetId: "alice-qr-gated", pairingId: invite.payload.pairingId });
  const accepted = await alice.nextOfType("invite:accept");
  const pairingId = accepted.payload.pairingId;

  alice.sendJson({
    type: "chat:message",
    targetId: "bob-qr-gated",
    pairingId,
    payload: { text: "blocked before qr" }
  });
  assert.equal((await alice.nextOfType("route:error")).payload.code, "proximity_not_verified");

  alice.sendJson({
    type: "proximity:qr:issue",
    targetId: "bob-qr-gated",
    pairingId
  });
  const issuedQr = await alice.nextOfType("proximity:qr:issued");
  bob.sendJson({
    type: "proximity:qr:verify",
    targetId: "alice-qr-gated",
    pairingId,
    payload: { token: issuedQr.payload.token }
  });
  assert.equal((await bob.nextOfType("proximity:qr:verified")).payload.valid, true);
  assert.equal(hub.isProximityVerified(pairingId), true);

  const afterQr = Date.now();
  alice.sendJson({
    type: "chat:message",
    targetId: "bob-qr-gated",
    pairingId,
    payload: { text: "allowed after qr" }
  });
  assert.equal((await bob.nextOfType("chat:message", { after: afterQr })).payload.payload.text, "allowed after qr");

  alice.close();
  bob.close();
});

test("rejects inconsistent transfer manifest totals", async () => {
  const alice = await connectClient("alice-manifest", "Alice Phone");
  const bob = await connectClient("bob-manifest", "Bob Tablet");
  alice.sendJson({ type: "invite", targetId: "bob-manifest" });
  const invite = await bob.nextOfType("invite");
  bob.sendJson({ type: "invite:accept", targetId: "alice-manifest", pairingId: invite.payload.pairingId });
  const accepted = await alice.nextOfType("invite:accept");
  alice.sendJson({
    type: "transfer:manifest",
    targetId: "bob-manifest",
    pairingId: accepted.payload.pairingId,
    payload: {
      transferId: "bad-total",
      totalBytes: 10,
      files: [{ id: "f", name: "bad.txt", size: 9 }]
    }
  });
  assert.equal((await alice.nextOfType("protocol:error")).payload.code, "manifest_size_mismatch");
  alice.close();
  bob.close();
});

test("invite rejection does not mark either peer connected", async () => {
  const alice = await connectClient("alice-reject", "Alice Phone");
  const bob = await connectClient("bob-reject", "Bob Tablet");

  alice.sendJson({ type: "invite", targetId: "bob-reject", payload: { note: "nearby" } });
  const invite = await bob.nextOfType("invite");
  const afterRejectRequest = Date.now();
  bob.sendJson({ type: "invite:reject", targetId: "alice-reject", pairingId: invite.payload.pairingId });
  await alice.nextOfType("invite:reject");

  alice.sendJson({
    type: "chat:message",
    targetId: "bob-reject",
    pairingId: invite.payload.pairingId,
    payload: { text: "still not paired" }
  });
  const error = await alice.nextOfType("route:error", { after: afterRejectRequest });
  assert.equal(error.payload.code, "pair_required");

  alice.close();
  bob.close();
});

test("keeps accepted pairings alive while websocket pong remains healthy", async () => {
  await restartServer({ SESSION_TTL_MS: "40", HEARTBEAT_INTERVAL_MS: "10" });
  const alice = await connectClient("alice-expire", "Alice Phone");
  const bob = await connectClient("bob-expire", "Bob Tablet");
  alice.sendJson({ type: "invite", targetId: "bob-expire" });
  const invite = await bob.nextOfType("invite");
  bob.sendJson({ type: "invite:accept", targetId: "alice-expire", pairingId: invite.payload.pairingId });
  const accepted = await alice.nextOfType("invite:accept");
  await new Promise((resolve) => setTimeout(resolve, 90));
  alice.sendJson({
    type: "chat:message",
    targetId: "bob-expire",
    pairingId: accepted.payload.pairingId,
    payload: { text: "still-active" }
  });
  assert.equal((await bob.nextOfType("chat:message")).payload.payload.text, "still-active");
  alice.close();
  bob.close();
});

test("rejects binary websocket payloads", async () => {
  const client = await connectClient("binary-user", "Binary User");
  client.socket.send(Buffer.from([1, 2, 3]));
  const error = await client.nextOfType("protocol:error");
  assert.equal(error.payload.code, "binary_not_allowed");
  client.close();
});

test("rejects oversized JSON messages", async () => {
  const client = await connectClient("large-user", "Large User");
  client.socket.send(JSON.stringify({
    type: "chat:message",
    targetId: "nobody",
    payload: { text: "x".repeat(4000) }
  }));
  const error = await client.nextOfType("protocol:error");
  assert.ok(["message_too_large", "rate_limited"].includes(error.payload.code));
  client.close();
});

test("rejects websocket connections from disallowed origins", async () => {
  await assert.rejects(
    () => new Promise((resolve, reject) => {
      const socket = new WebSocket(baseUrl.replace("http:", "ws:") + "/ws", {
        headers: {
          Origin: "http://evil.example"
        }
      });
      socket.once("open", () => {
        socket.close();
        resolve();
      });
      socket.once("error", reject);
    }),
    /Unexpected server response: 403/
  );
});

test("socket cleanup notifies only the disconnected peer's active partner", async () => {
  const alice = await connectClient("alice-cleanup", "Alice Phone");
  const bob = await connectClient("bob-cleanup", "Bob Tablet");
  const charlie = await connectClient("charlie-cleanup", "Charlie Laptop");
  alice.sendJson({ type: "invite", targetId: "bob-cleanup" });
  const invite = await bob.nextOfType("invite");
  bob.sendJson({ type: "invite:accept", targetId: "alice-cleanup", pairingId: invite.payload.pairingId });
  await Promise.all([
    alice.nextOfType("invite:accept"),
    bob.nextOfType("invite:accept")
  ]);

  const disconnectedAt = Date.now();
  alice.close();
  assert.equal((await bob.nextOfType("peer:disconnected", { after: disconnectedAt })).payload.peerId, "alice-cleanup");
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(
    charlie.messages.some((message) => message.type === "peer:disconnected" && message._seenAt >= disconnectedAt),
    false
  );
  bob.close();
  charlie.close();
});

async function connectClient(id, deviceName) {
  const socket = new WebSocket(baseUrl.replace("http:", "ws:") + "/ws", {
    headers: {
      Origin: "http://allowed.example"
    }
  });
  const messages = [];
  const waiters = [];
  socket.on("message", (data) => {
    const parsed = JSON.parse(data.toString());
    parsed._seenAt = Date.now();
    messages.push(parsed);
    for (const waiter of [...waiters]) waiter();
  });
  await new Promise((resolve) => socket.once("open", resolve));
  socket.send(JSON.stringify({
    type: "client:hello",
    payload: { self: { id, deviceName } }
  }));
  await nextOfType("connected");
  return {
    socket,
    messages,
    sendJson(message) {
      socket.send(JSON.stringify(message));
    },
    nextOfType,
    close() {
      socket.close();
    }
  };

  async function nextOfType(type, { after = 0 } = {}) {
    const existing = messages.find((message) => message.type === type && message._seenAt >= after);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${type}. Received ${messages.map((message) => message.type).join(", ")}`));
      }, 2500);
      const check = () => {
        const message = messages.find((candidate) => candidate.type === type && candidate._seenAt >= after);
        if (!message) return;
        clearTimeout(timeout);
        waiters.splice(waiters.indexOf(check), 1);
        resolve(message);
      };
      waiters.push(check);
    });
  }
}

function silentLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

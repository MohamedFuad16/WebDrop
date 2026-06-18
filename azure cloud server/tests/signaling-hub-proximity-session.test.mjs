import test from "node:test";
import assert from "node:assert/strict";
import { SignalingHub } from "../src/signaling-hub.js";
import { ProximityScoreAnalyzer } from "../src/proximity-score.js";

test("proximity session matches the intended pair while a third client is nearby", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const clientC = addClient(hub, "client-c");
  const session = createSession(hub, [clientA, clientB, clientC]);

  hub.recordProximitySessionTelemetry(clientC, sessionMessage(session.id, verifiedMetrics(), 4000));
  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session.id, verifiedMetrics(), 1000));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session.id, verifiedMetrics(), 1080));

  assert.equal(clientA.pairingId, clientB.pairingId);
  assert.ok(clientA.pairingId);
  assert.equal(clientC.pairingId, null);
  assert.equal(messagesOf(clientA, "proximity:match")[0].payload.peerId, "client-b");
  assert.equal(messagesOf(clientB, "proximity:match")[0].payload.peerId, "client-a");
  assert.equal(messagesOf(clientC, "proximity:match").length, 0);

  hub.close();
});

test("proximity session rejects scores below 55", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session.id, { acoustic: true }, 1000));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session.id, { acoustic: true }, 1040));

  assert.equal(clientA.pairingId, null);
  assert.equal(clientB.pairingId, null);
  assert.equal(messagesOf(clientA, "proximity:match").length, 0);
  assert.equal(messagesOf(clientB, "proximity:match").length, 0);

  hub.close();
});

function createTestHub() {
  return new SignalingHub({
    server: { on() {} },
    proximityAnalyzer: new ProximityScoreAnalyzer({ enabled: false })
  });
}

function addClient(hub, id) {
  const socket = {
    readyState: 1,
    messages: [],
    send(raw) {
      this.messages.push(JSON.parse(raw));
    },
    close() {}
  };
  const client = {
    id,
    socket,
    deviceId: id,
    deviceName: id,
    avatarId: null,
    avatar: null,
    ringColor: null,
    deviceFamily: "ios",
    deviceLabel: "iPhone",
    capabilities: {},
    joinedAt: new Date().toISOString(),
    pairingId: null,
    lastSeenAt: Date.now()
  };
  hub.clients.set(id, client);
  return client;
}

function createSession(hub, clients) {
  const session = {
    id: "session-a",
    clients: new Set(clients.map((client) => client.id)),
    nonces: new Map(),
    telemetry: new Map(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 120000,
    joinUntil: Date.now(),
    started: true,
    matched: new Set(),
    timer: null,
    failTimer: null
  };
  hub.proximitySessions.set(session.id, session);
  return session;
}

function sessionMessage(sessionId, metrics, bumpAt) {
  return {
    payload: {
      sessionId,
      clientNonce: "nonce",
      metrics,
      timing: {
        startedAt: bumpAt - 100,
        bumpAt,
        completedAt: bumpAt + 100
      }
    }
  };
}

function verifiedMetrics() {
  return {
    acoustic: true,
    soundCorrelation: 1,
    motionCorrelation: 1,
    bump: true,
    tilt: true
  };
}

function messagesOf(client, type) {
  return client.socket.messages.filter((message) => message.type === type);
}

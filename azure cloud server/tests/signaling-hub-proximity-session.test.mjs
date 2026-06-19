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

  hub.recordProximitySessionTelemetry(clientC, sessionMessage(session, clientC, verifiedMetrics(), 4000, clientA));
  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, verifiedMetrics(), 1000, clientB));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, verifiedMetrics(), 1080, clientA));

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

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, { acoustic: true }, 1000, clientB));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, { acoustic: true }, 1040, clientA));

  assert.equal(clientA.pairingId, null);
  assert.equal(clientB.pairingId, null);
  assert.equal(messagesOf(clientA, "proximity:match").length, 0);
  assert.equal(messagesOf(clientB, "proximity:match").length, 0);

  hub.close();
});

test("proximity session keeps two simultaneous reciprocal signature pairs separate", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const clientC = addClient(hub, "client-c");
  const clientD = addClient(hub, "client-d");
  const session = createSession(hub, [clientA, clientB, clientC, clientD]);

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, verifiedMetrics(), 1000, clientB));
  hub.recordProximitySessionTelemetry(clientC, sessionMessage(session, clientC, verifiedMetrics(), 1002, clientD));
  hub.recordProximitySessionTelemetry(clientD, sessionMessage(session, clientD, verifiedMetrics(), 1004, clientC));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, verifiedMetrics(), 1006, clientA));

  assert.equal(clientA.pairingId, clientB.pairingId);
  assert.equal(clientC.pairingId, clientD.pairingId);
  assert.notEqual(clientA.pairingId, clientC.pairingId);
  assert.equal(messagesOf(clientA, "proximity:match")[0].payload.peerId, "client-b");
  assert.equal(messagesOf(clientC, "proximity:match")[0].payload.peerId, "client-d");

  hub.close();
});

test("proximity session rejects telemetry with the wrong join nonce", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);
  const message = sessionMessage(session, clientA, verifiedMetrics(), 1000, clientB);
  message.payload.clientNonce = "wrong-nonce";

  hub.recordProximitySessionTelemetry(clientA, message);

  assert.equal(session.telemetry.has(clientA.id), false);
  assert.equal(messagesOf(clientA, "proximity:session:failed")[0].payload.reason, "session_nonce_mismatch");

  hub.close();
});

test("proximity join window keeps four clients together and rolls a fifth into a new session", () => {
  const hub = createTestHub();
  const clients = Array.from({ length: 5 }, (_, index) => addClient(hub, `client-${index}`));

  for (const client of clients) {
    hub.joinProximitySession(client, {
      payload: { clientNonce: `nonce-${client.id}` }
    });
  }

  const sessions = [...hub.proximitySessions.values()];
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].clients.size, 4);
  assert.equal(sessions[1].clients.size, 1);

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
    nonces: new Map(clients.map((client) => [client.id, `nonce-${client.id}`])),
    signatures: new Map(clients.map((client, index) => [client.id, `signature-${index}`])),
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

function sessionMessage(session, sender, metrics, bumpAt, heardClient) {
  return {
    payload: {
      sessionId: session.id,
      clientNonce: session.nonces.get(sender.id),
      metrics: {
        ...metrics,
        acousticSignatureId: session.signatures.get(sender.id),
        heardAcousticSignatureId: session.signatures.get(heardClient.id)
      },
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

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

test("proximity session rejects a high score without explicit bump and tilt evidence", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);
  const incomplete = {
    acoustic: true,
    soundCorrelation: 1,
    motionCorrelation: 1,
    bump: false,
    tilt: false,
    qrFallback: true
  };

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, incomplete, 1000, clientB));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, incomplete, 1040, clientA));

  assert.equal(session.telemetry.get(clientA.id).analysis.score >= 0.55, true);
  assert.equal(session.telemetry.get(clientA.id).analysis.decision, "insufficient");
  assert.deepEqual(session.telemetry.get(clientA.id).analysis.physicalEvidence, {
    ultrasound: true,
    bump: false,
    tilt: false
  });
  assert.equal(clientA.pairingId, null);
  assert.equal(clientB.pairingId, null);

  hub.close();
});

test("proximity session rejects bump evidence outside the issued ceremony window", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);

  hub.recordProximitySessionTelemetry(
    clientA,
    sessionMessage(session, clientA, verifiedMetrics(), session.startAt - 1000, clientB)
  );

  assert.equal(session.telemetry.has(clientA.id), false);
  assert.equal(messagesOf(clientA, "proximity:session:failed")[0].payload.reason, "timing_out_of_window");

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

test("proximity join window keeps five nearby clients in one coded session", () => {
  const hub = createTestHub();
  const clients = Array.from({ length: 5 }, (_, index) => addClient(hub, `client-${index}`));

  for (const client of clients) {
    hub.joinProximitySession(client, {
      payload: { clientNonce: `nonce-${client.id}` }
    });
  }

  const sessions = [...hub.proximitySessions.values()];
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].clients.size, 5);

  hub.startProximitySession(sessions[0].id);
  const starts = clients.map((client) => messagesOf(client, "proximity:session:start")[0]);
  assert.equal(starts.every(Boolean), true);
  assert.equal(new Set(starts[0].payload.acousticPlan.map((signature) => signature.code)).size, 5);
  assert.equal(new Set(starts[0].payload.acousticPlan.map((signature) => `${signature.startFrequencyHz}-${signature.endFrequencyHz}`)).size, 1);

  hub.close();
});

test("proximity session rejects reciprocal signatures with an ambiguous winner margin", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);
  const ambiguous = { ...verifiedMetrics(), acousticConfidenceMargin: 0.01 };

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, ambiguous, 1000, clientB));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, ambiguous, 1020, clientA));

  assert.equal(clientA.pairingId, null);
  assert.equal(clientB.pairingId, null);
  assert.equal(messagesOf(clientA, "proximity:match").length, 0);
  hub.close();
});

test("a one-client session extends once and accepts a slightly late partner", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA]);
  session.started = false;
  session.joinExtensions = 0;
  hub.openProximitySessionId = session.id;

  hub.startProximitySession(session.id);
  assert.equal(session.started, false);
  assert.equal(session.joinExtensions, 1);
  assert.equal(hub.openProximitySessionId, session.id);

  hub.joinProximitySession(clientB, {
    payload: { clientNonce: `nonce-${clientB.id}` }
  });
  assert.equal(session.clients.has(clientB.id), true);
  assert.equal(session.clients.size, 2);

  hub.close();
});

test("proximity session keeps only the newest connection for one physical device", () => {
  const hub = createTestHub();
  const staleClient = addClient(hub, "client-a-stale");
  const currentClient = addClient(hub, "client-a-current");
  const peer = addClient(hub, "client-b");
  staleClient.deviceId = "device-a";
  currentClient.deviceId = "device-a";
  staleClient.lastSeenAt = 1000;
  currentClient.lastSeenAt = 2000;
  const session = createSession(hub, [staleClient, currentClient, peer]);

  hub.pruneProximitySessionClients(session);

  assert.deepEqual([...session.clients].sort(), ["client-a-current", "client-b"]);
  assert.equal(session.nonces.has(staleClient.id), false);
  assert.equal(session.nonces.has(currentClient.id), true);

  hub.close();
});

test("diagnostics snapshot exposes safe live proximity and acoustic state", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);
  session.signatureDetails = new Map([
    [clientA.id, { id: "signature-0", slot: 1, startFrequencyHz: 18600, endFrequencyHz: 18820 }],
    [clientB.id, { id: "signature-1", slot: 2, startFrequencyHz: 19020, endFrequencyHz: 19240 }]
  ]);
  const message = sessionMessage(session, clientA, verifiedMetrics(), 1000, clientB);
  Object.assign(message.payload.metrics, {
    acousticEmitted: true,
    acousticDetected: true,
    acousticMode: "detected",
    acousticSlot: 2,
    acousticSlotCount: 2,
    acousticStartFrequencyHz: 19020,
    acousticEndFrequencyHz: 19240,
    acousticMarginDb: 24,
    acousticSampleRate: 48000,
    acousticConfidenceMargin: 0.44,
    acousticRunnerUpCorrelation: 0.31,
    acousticDetections: [{ signatureId: "signature-1", correlation: 0.75, marginDb: 24 }]
  });

  hub.recordProximitySessionTelemetry(clientA, message);
  const snapshot = hub.diagnosticsSnapshot();

  assert.equal(snapshot.clients.length, 2);
  assert.equal(snapshot.proximitySessions.length, 1);
  assert.equal(snapshot.proximitySessions[0].participants[0].signature.slot, 1);
  assert.deepEqual(snapshot.proximitySessions[0].participants[0].telemetry.acoustic, {
    emitted: true,
    detected: true,
    mode: "detected",
    slot: 2,
    slotCount: 2,
    startFrequencyHz: 19020,
    endFrequencyHz: 19240,
    marginDb: 24,
    sampleRate: 48000,
    confidenceMargin: 0.44,
    runnerUpCorrelation: 0.31,
    detections: [{ signatureId: "signature-1", correlation: 0.75, marginDb: 24 }],
    reason: null
  });
  assert.equal("turnAccessToken" in snapshot.clients[0], false);

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
    acousticCapabilities: new Map(),
    telemetry: new Map(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 120000,
    joinUntil: Date.now(),
    startAt: 900,
    endsAt: 5000,
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
        startedAt: session.startAt,
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

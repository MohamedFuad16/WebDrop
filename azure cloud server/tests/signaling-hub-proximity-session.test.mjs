import test from "node:test";
import assert from "node:assert/strict";
import { SignalingHub } from "../src/signaling-hub.js";
import { ProximityScoreAnalyzer } from "../src/proximity-score.js";
import { ServerMetrics } from "../src/metrics.js";

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
  assert.equal(messagesOf(clientA, "proximity:session:telemetry:accepted")[0].payload.decision, "verified");
  assert.equal(messagesOf(clientB, "proximity:session:telemetry:accepted")[0].payload.decision, "verified");
  assert.equal(messagesOf(clientA, "proximity:match")[0].payload.peerId, "client-b");
  assert.equal(messagesOf(clientB, "proximity:match")[0].payload.peerId, "client-a");
  assert.equal(messagesOf(clientC, "proximity:match").length, 0);

  hub.close();
});

test("proximity session accepts reciprocal energy-assisted acoustic detections", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);

  hub.recordProximitySessionTelemetry(
    clientA,
    sessionMessage(session, clientA, energyAssistedMetrics(session, clientB), 1000, clientB)
  );
  hub.recordProximitySessionTelemetry(
    clientB,
    sessionMessage(session, clientB, energyAssistedMetrics(session, clientA), 1040, clientA)
  );

  assert.equal(clientA.pairingId, clientB.pairingId);
  assert.ok(clientA.pairingId);
  assert.equal(messagesOf(clientA, "proximity:match")[0].payload.peerId, "client-b");
  assert.equal(messagesOf(clientB, "proximity:match")[0].payload.peerId, "client-a");

  hub.close();
});

test("proximity session accepts reciprocal weak packet-consensus acoustic detections", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);

  hub.recordProximitySessionTelemetry(
    clientA,
    sessionMessage(session, clientA, packetConsensusMetrics(session, clientB, 4, 0.07), 1000, clientB)
  );
  hub.recordProximitySessionTelemetry(
    clientB,
    sessionMessage(session, clientB, packetConsensusMetrics(session, clientA, 4, 0.08), 1040, clientA)
  );

  assert.equal(clientA.pairingId, clientB.pairingId);
  assert.ok(clientA.pairingId);
  assert.equal(messagesOf(clientA, "proximity:match")[0].payload.peerId, "client-b");
  assert.equal(messagesOf(clientB, "proximity:match")[0].payload.peerId, "client-a");

  hub.close();
});

test("proximity session rejects a single weak packet-consensus pulse", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);

  hub.recordProximitySessionTelemetry(
    clientA,
    sessionMessage(session, clientA, packetConsensusMetrics(session, clientB, 1, 0.07), 1000, clientB)
  );
  hub.recordProximitySessionTelemetry(
    clientB,
    sessionMessage(session, clientB, packetConsensusMetrics(session, clientA, 4, 0.08), 1040, clientA)
  );

  assert.equal(clientA.pairingId, null);
  assert.equal(clientB.pairingId, null);
  assert.equal(messagesOf(clientA, "proximity:match").length, 0);
  assert.equal(messagesOf(clientB, "proximity:match").length, 0);

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

test("proximity failure reports missing acoustics before low score when audio is absent", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);
  const missingAcoustic = {
    ...verifiedMetrics(),
    acoustic: false,
    soundCorrelation: 0
  };

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, missingAcoustic, 1000, clientB));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, missingAcoustic, 1040, clientA));
  hub.failUnmatchedProximitySession(session.id);

  const failure = messagesOf(clientA, "proximity:session:failed")[0];
  assert.ok(Math.abs(failure.payload.score - 0.58) < 0.000001);
  assert.equal(failure.payload.reason, "acoustic_not_detected");

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

test("proximity session accepts a bump made at connect-tap time (before startAt)", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);
  // Realistic epoch timing, all in the past (telemetry always arrives after the
  // window closes): tapped 8s ago, ceremony started 6s ago, ended 0.5s ago.
  const now = Date.now();
  session.createdAt = now - 8000;
  session.startAt = now - 6000;
  session.endsAt = now - 500;
  // Both users bumped right after tapping Connect — ~1.9s BEFORE startAt. This
  // was the "immediate bump fails" case; it must now pair.
  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, verifiedMetrics(), session.createdAt + 100, clientB));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, verifiedMetrics(), session.createdAt + 160, clientA));

  assert.ok(clientA.pairingId);
  assert.equal(clientA.pairingId, clientB.pairingId);
  hub.close();
});

test("proximity session rejects bump evidence outside the issued ceremony window", () => {
  const metrics = new ServerMetrics();
  const hub = createTestHub({ metrics });
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);

  hub.recordProximitySessionTelemetry(
    clientA,
    sessionMessage(session, clientA, verifiedMetrics(), session.startAt - 1000, clientB)
  );

  assert.equal(session.telemetry.has(clientA.id), false);
  assert.equal(messagesOf(clientA, "proximity:session:failed")[0].payload.reason, "timing_out_of_window");
  const rejection = metrics.summary().recentEvents.find((event) => event.type === "proximity:session:telemetry:rejected");
  assert.equal(rejection.detail.reason, "timing_out_of_window");
  assert.equal(rejection.detail.clientId, clientA.id);
  assert.equal(rejection.detail.timing.valid, false);
  assert.equal(Number.isFinite(rejection.detail.timing.bumpFromStartMs), true);

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

test("a stale already-paired best candidate does not block the remaining pair", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const clientC = addClient(hub, "client-c");
  const clientD = addClient(hub, "client-d");
  const session = createSession(hub, [clientA, clientB, clientC, clientD]);

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, verifiedMetrics(), 1000, clientB));
  // A gives up and pairs via QR/invite before B's telemetry lands: the (A,B)
  // pair is now unusable, but it has the smallest bump delta so it stays the
  // "best" candidate forever. C and D must still match.
  clientA.pairingId = "external-qr-pairing";
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, verifiedMetrics(), 1010, clientA));
  hub.recordProximitySessionTelemetry(clientC, sessionMessage(session, clientC, verifiedMetrics(), 2400, clientD));
  hub.recordProximitySessionTelemetry(clientD, sessionMessage(session, clientD, verifiedMetrics(), 2410, clientC));

  assert.ok(clientC.pairingId);
  assert.equal(clientC.pairingId, clientD.pairingId);
  assert.equal(clientB.pairingId, null);
  assert.equal(messagesOf(clientC, "proximity:match")[0].payload.peerId, "client-d");
  assert.equal(messagesOf(clientD, "proximity:match")[0].payload.peerId, "client-c");

  hub.close();
});

test("crossed acoustic decodes with distant bumps do not connect the wrong pair", () => {
  const hub = createTestHub();
  const a1 = addClient(hub, "pair-a-1");
  const a2 = addClient(hub, "pair-a-2");
  const b1 = addClient(hub, "pair-b-1");
  const b2 = addClient(hub, "pair-b-2");
  const session = createSession(hub, [a1, a2, b1, b2]);

  // Each true pair has one phone with a weak/blocked speaker (the classic
  // first-attempt failure), so the two WORKING phones across pairs hear each
  // other as their top decode: (a1,b1) is formally reciprocal. Their bumps are
  // 2s apart (within match slop) but each has a true partner whose bump landed
  // ~150ms away — the veto must reject the cross pair instead of connecting
  // two strangers.
  hub.recordProximitySessionTelemetry(a1, sessionMessage(session, a1, verifiedMetrics(), 1000, b1));
  hub.recordProximitySessionTelemetry(a2, sessionMessage(session, a2, { acoustic: true }, 1150, a1));
  hub.recordProximitySessionTelemetry(b1, sessionMessage(session, b1, verifiedMetrics(), 3000, a1));
  hub.recordProximitySessionTelemetry(b2, sessionMessage(session, b2, { acoustic: true }, 3150, b1));

  assert.equal(a1.pairingId, null);
  assert.equal(a2.pairingId, null);
  assert.equal(b1.pairingId, null);
  assert.equal(b2.pairingId, null);
  assert.equal(messagesOf(a1, "proximity:match").length, 0);
  assert.equal(messagesOf(b1, "proximity:match").length, 0);

  hub.close();
});

test("two true pairs bumping at different moments both match in one cohort", () => {
  const hub = createTestHub();
  const a1 = addClient(hub, "pair-a-1");
  const a2 = addClient(hub, "pair-a-2");
  const b1 = addClient(hub, "pair-b-1");
  const b2 = addClient(hub, "pair-b-2");
  const session = createSession(hub, [a1, a2, b1, b2]);

  hub.recordProximitySessionTelemetry(a1, sessionMessage(session, a1, verifiedMetrics(), 1000, a2));
  hub.recordProximitySessionTelemetry(a2, sessionMessage(session, a2, verifiedMetrics(), 1100, a1));
  hub.recordProximitySessionTelemetry(b1, sessionMessage(session, b1, verifiedMetrics(), 3000, b2));
  hub.recordProximitySessionTelemetry(b2, sessionMessage(session, b2, verifiedMetrics(), 3050, b1));

  assert.ok(a1.pairingId);
  assert.equal(a1.pairingId, a2.pairingId);
  assert.ok(b1.pairingId);
  assert.equal(b1.pairingId, b2.pairingId);
  assert.notEqual(a1.pairingId, b1.pairingId);
  assert.equal(messagesOf(a1, "proximity:match")[0].payload.peerId, "pair-a-2");
  assert.equal(messagesOf(b1, "proximity:match")[0].payload.peerId, "pair-b-2");

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
  assert.equal(messagesOf(clientA, "proximity:session:telemetry:accepted").length, 0);

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

test("proximity session rejects reciprocal signatures with no reported winner margin", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA, clientB]);
  const noMargin = {
    acoustic: true,
    soundCorrelation: 1,
    motionCorrelation: 1,
    bump: true,
    tilt: true
  };

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, noMargin, 1000, clientB));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, noMargin, 1020, clientA));

  assert.equal(session.telemetry.get(clientA.id).analysis.acousticConfidenceMargin, null);
  assert.equal(clientA.pairingId, null);
  assert.equal(clientB.pairingId, null);
  assert.equal(messagesOf(clientA, "proximity:match").length, 0);
  assert.equal(messagesOf(clientB, "proximity:match").length, 0);

  hub.close();
});

test("proximity session rejects a non-reciprocal cross configuration", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const clientC = addClient(hub, "client-c");
  const session = createSession(hub, [clientA, clientB, clientC]);

  hub.recordProximitySessionTelemetry(clientA, sessionMessage(session, clientA, verifiedMetrics(), 1000, clientB));
  hub.recordProximitySessionTelemetry(clientB, sessionMessage(session, clientB, verifiedMetrics(), 1010, clientC));
  hub.recordProximitySessionTelemetry(clientC, sessionMessage(session, clientC, verifiedMetrics(), 1020, clientA));

  assert.equal(clientA.pairingId, null);
  assert.equal(clientB.pairingId, null);
  assert.equal(clientC.pairingId, null);
  assert.equal(messagesOf(clientA, "proximity:match").length, 0);
  assert.equal(messagesOf(clientB, "proximity:match").length, 0);
  assert.equal(messagesOf(clientC, "proximity:match").length, 0);

  hub.close();
});

test("a one-client session extends once and accepts a slightly late partner", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  const session = createSession(hub, [clientA]);
  session.started = false;
  session.joinExtensions = 0;
  hub.openProximitySessionIds.add(session.id);

  hub.startProximitySession(session.id);
  assert.equal(session.started, false);
  assert.equal(session.joinExtensions, 1);
  assert.ok(hub.openProximitySessionIds.has(session.id));

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
    acousticRecordingDurationMs: 3600,
    acousticRecordingRms: 0.012,
    acousticRecordingPeak: 0.08,
    acousticConfidenceMargin: 0.44,
    acousticRunnerUpCorrelation: 0.31,
    acousticDetections: [{ signatureId: "signature-1", correlation: 0.75, marginDb: 24 }]
  });

  hub.recordProximitySessionTelemetry(clientA, message);
  const snapshot = hub.diagnosticsSnapshot();

  assert.equal(snapshot.clients.length, 2);
  assert.equal(snapshot.proximitySessions.length, 1);
  assert.equal(snapshot.protocol.scoreMinimum, 0.55);
  assert.equal(snapshot.protocol.acousticSlotCorrelationMin, 0.2);
  assert.equal(snapshot.protocol.acousticPacketConsensusMinCorrelation, 0.05);
  assert.equal(snapshot.protocol.acousticPacketConsensusMinCount, 3);
  assert.equal(snapshot.protocol.energyAssistedMinMarginDb, 4.5);
  assert.equal(snapshot.proximitySessions[0].participants[0].signature.slot, 1);
  assert.deepEqual(snapshot.proximitySessions[0].participants[0].acousticCapabilities, {
    sampleRate: null,
    strictInaudible: false,
    audioContextReady: false,
    microphoneReady: false
  });
  assert.deepEqual(snapshot.proximitySessions[0].participants[0].telemetry.acoustic, {
    emitted: true,
    detected: true,
    mode: "detected",
    slot: 2,
    slotCount: 2,
    startFrequencyHz: 19020,
    endFrequencyHz: 19240,
    marginDb: 24,
    detectionMethod: null,
    sampleRate: 48000,
    recordingDurationMs: 3600,
    recordingRms: 0.012,
    recordingPeak: 0.08,
    confidenceMargin: 0.44,
    runnerUpCorrelation: 0.31,
    detections: [{ signatureId: "signature-1", correlation: 0.75, marginDb: 24 }],
    reason: null
  });
  assert.equal("turnAccessToken" in snapshot.clients[0], false);

  hub.close();
});

test("admin monitor routes continuous acoustic telemetry from a selected device", () => {
  const metrics = new ServerMetrics();
  const hub = createTestHub({ metrics });
  const admin = addClient(hub, "admin-a");
  const phone = addClient(hub, "phone-a");
  admin.capabilities = { admin: true };
  admin.deviceFamily = "admin";
  phone.deviceName = "Pixel 9";
  phone.deviceFamily = "android";
  phone.deviceLabel = null;

  hub.startAdminMonitor(admin, {
    type: "admin:monitor:start",
    targetId: phone.id,
    payload: {
      monitorId: "monitor-a",
      intervalMs: 1000,
      startFrequencyHz: 18600,
      endFrequencyHz: 19400,
      emit: true
    }
  });

  assert.equal(messagesOf(phone, "admin:monitor:start")[0].payload.monitorId, "monitor-a");
  assert.equal(messagesOf(phone, "admin:monitor:start")[0].payload.adminId, admin.id);
  assert.equal(messagesOf(admin, "admin:monitor:started")[0].payload.targetId, phone.id);

  hub.handleMessage(phone.socket, Buffer.from(JSON.stringify({
    type: "admin:monitor:telemetry",
    targetId: admin.id,
    payload: {
      monitorId: "monitor-a",
      status: "active",
      sequence: 1,
      sampleRate: 48000,
      emitted: true,
      detected: true,
      startFrequencyHz: 18600,
      endFrequencyHz: 19400,
      marginDb: 9.4,
      confidence: 0.42,
      bumpDetected: true,
      bumpPoints: 20,
      tiltDetected: true,
      tiltDegrees: 34,
      motionSamples: 72,
      maxAcceleration: 16.8,
      bands: [{
        startFrequencyHz: 18500,
        endFrequencyHz: 19500,
        detected: true,
        peakDb: -42,
        noiseDb: -51.4,
        marginDb: 9.4,
        confidence: 0.42
      }]
    }
  })), false);

  const telemetry = messagesOf(admin, "admin:monitor:telemetry")[0].payload;
  assert.equal(telemetry.deviceId, phone.id);
  assert.equal(telemetry.deviceName, "Pixel 9");
  assert.equal(telemetry.deviceFamily, "android");
  assert.equal(telemetry.detected, true);
  assert.equal(telemetry.marginDb, 9.4);
  assert.equal(telemetry.bumpPoints, 20);
  assert.equal(telemetry.tiltDegrees, 34);
  assert.equal(telemetry.motionSamples, 72);
  assert.equal(telemetry.bands.length, 1);
  assert.equal(telemetry.bands[0].startFrequencyHz, 18500);
  const monitorEvents = metrics.summary().recentEvents.filter((event) => event.type === "admin:monitor:telemetry");
  assert.equal(monitorEvents.length, 1);
  assert.equal(monitorEvents[0].detail.monitorId, "monitor-a");

  hub.stopAdminMonitor(admin, {
    type: "admin:monitor:stop",
    targetId: phone.id,
    payload: { monitorId: "monitor-a" }
  });

  assert.equal(messagesOf(phone, "admin:monitor:stop")[0].payload.monitorId, "monitor-a");
  assert.equal(messagesOf(admin, "admin:monitor:stopped")[0].payload.targetId, phone.id);

  hub.close();
});

test("starting a proximity session extends expiresAt past the telemetry window", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  hub.joinProximitySession(clientA, { payload: { clientNonce: "nonce-client-a", acousticCapabilities: { sampleRate: 48000 } } });
  hub.joinProximitySession(clientB, { payload: { clientNonce: "nonce-client-b", acousticCapabilities: { sampleRate: 48000 } } });
  const session = [...hub.proximitySessions.values()][0];

  hub.startProximitySession(session.id);

  const slop = Number(session.tuning?.timing?.matchSlopMs ?? hub.proximityMatchSlopMs);
  assert.equal(session.started, true);
  assert.ok(Number.isFinite(session.endsAt));
  // The failTimer keeps the session alive until endsAt + slop; expiresAt must
  // now cover at least that window (plus the 2s client ack/retry slack).
  assert.ok(
    session.expiresAt >= session.endsAt + slop + 2000,
    `expiresAt ${session.expiresAt} should cover endsAt ${session.endsAt} + slop ${slop} + 2000`
  );

  hub.close();
});

test("a session whose window outlives the creation TTL still accepts late telemetry", () => {
  const hub = createTestHub();
  const clientA = addClient(hub, "client-a");
  const clientB = addClient(hub, "client-b");
  hub.joinProximitySession(clientA, { payload: { clientNonce: "nonce-client-a" } });
  hub.joinProximitySession(clientB, { payload: { clientNonce: "nonce-client-b" } });
  const session = [...hub.proximitySessions.values()][0];

  // Simulate a late-tap-grace start: the cohort was created ~12s before it
  // actually started, so its acoustic window ends after the creation-based TTL.
  session.createdAt = Date.now() - 12000;
  session.expiresAt = session.createdAt + hub.proximitySessionTtlMs;

  hub.startProximitySession(session.id);

  // Fast-forward the session's clock so "now" is 2s past the window end — the
  // exact shape of the live rejection (telemetry arriving at endsAt + ~2s).
  const shift = session.endsAt - Date.now() + 2000;
  session.startAt -= shift;
  session.endsAt -= shift;
  session.createdAt -= shift;
  session.expiresAt -= shift;

  hub.recordProximitySessionTelemetry(
    clientA,
    sessionMessage(session, clientA, verifiedMetrics(), session.startAt + 1200, clientB)
  );

  assert.equal(messagesOf(clientA, "proximity:session:telemetry:accepted").length, 1);
  assert.equal(messagesOf(clientA, "proximity:session:failed").length, 0);

  hub.close();
});

function createTestHub({ metrics } = {}) {
  return new SignalingHub({
    server: { on() {} },
    proximityAnalyzer: new ProximityScoreAnalyzer({ enabled: false }),
    metrics
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
  hub.socketToClient.set(socket, client);
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
    tilt: true,
    acousticConfidenceMargin: 0.5
  };
}

function energyAssistedMetrics(session, heardClient) {
  const heardSignature = session.signatures.get(heardClient.id);
  return {
    ...verifiedMetrics(),
    acousticDetected: true,
    acousticCorrelation: 0.21,
    acousticMarginDb: 4.8,
    acousticDetectionMethod: "energy-assisted",
    acousticConfidenceMargin: 0.21,
    acousticDetections: [{
      signatureId: heardSignature,
      correlation: 0.21,
      marginDb: 4.8,
      detectionMethod: "energy-assisted",
      energyAssisted: true
    }]
  };
}

function packetConsensusMetrics(session, heardClient, packetCount, packetAverageCorrelation) {
  const heardSignature = session.signatures.get(heardClient.id);
  return {
    ...verifiedMetrics(),
    acousticDetected: true,
    acousticCorrelation: packetAverageCorrelation,
    acousticMarginDb: 0,
    acousticDetectionMethod: "packet-consensus",
    acousticConfidenceMargin: packetAverageCorrelation,
    acousticDetections: [{
      signatureId: heardSignature,
      correlation: packetAverageCorrelation,
      marginDb: 0,
      detectionMethod: "packet-consensus",
      energyAssisted: false,
      packetCount,
      packetAverageCorrelation,
      packetSpacingMs: 332
    }]
  };
}

function messagesOf(client, type) {
  return client.socket.messages.filter((message) => message.type === type);
}

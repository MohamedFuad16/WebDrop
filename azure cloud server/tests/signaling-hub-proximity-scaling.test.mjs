import test from "node:test";
import assert from "node:assert/strict";
import { SignalingHub } from "../src/signaling-hub.js";
import { ProximityScoreAnalyzer } from "../src/proximity-score.js";

// These tests cover the concurrent-session scaling model: many small acoustic
// cohorts opened concurrently, each bounded so its time slots never drop below
// the acoustic floor, with a global participant cap on top.

test("a full cohort closes and the next joiner opens a second concurrent session", () => {
  const hub = createHub();
  const cohort = hub.maxProximitySessionClients;
  assert.equal(cohort, 6);

  const clients = joinMany(hub, cohort);
  assert.equal(hub.proximitySessions.size, 1);
  const [firstSession] = [...hub.proximitySessions.values()];
  assert.equal(firstSession.clients.size, cohort);
  // A full cohort is removed from the open set so it no longer accepts joiners.
  assert.equal(hub.openProximitySessionIds.has(firstSession.id), false);

  const overflow = joinOne(hub, `client-${cohort}`);
  assert.equal(hub.proximitySessions.size, 2);
  const overflowSession = hub.findProximitySessionForClient(overflow.id);
  assert.notEqual(overflowSession.id, firstSession.id);
  assert.equal(overflowSession.clients.size, 1);
  assert.equal(overflow.socket.messages.at(-1).payload.sessionId, overflowSession.id);

  // Each client landed in exactly one session and codes stay 0..n-1 per cohort.
  assert.equal(hub.totalProximityParticipants(), cohort + 1);

  hub.close();
});

test("per-session cohort is clamped to the slot-floor ceiling and never schedules sub-floor slots", () => {
  // Asking for 100 per session is clamped to the ceiling derived from the
  // ceremony window and the ~600 ms acoustic slot floor (3600 / 600 = 6).
  const hub = createHub({ maxProximitySessionClients: 100 });
  assert.equal(hub.proximityCohortCeiling, 6);
  assert.equal(hub.maxProximitySessionClients, 6);

  // Drive far more participants than one cohort can hold and verify EVERY
  // resulting session keeps its slots at or above the floor.
  joinMany(hub, 20);
  const slotFloorMs = 600;
  for (const session of hub.proximitySessions.values()) {
    assert.ok(session.clients.size <= hub.maxProximitySessionClients);
    const slotMs = Math.floor(hub.proximityDurationMs / session.clients.size);
    assert.ok(slotMs >= slotFloorMs, `slot ${slotMs}ms below floor for size ${session.clients.size}`);
  }

  // Confirm the emitted ceremony plan also respects the floor for a full cohort.
  const fullSession = [...hub.proximitySessions.values()].find((session) => session.clients.size === hub.maxProximitySessionClients);
  hub.startProximitySession(fullSession.id);
  const start = firstStart(hub, fullSession);
  assert.ok(Math.floor(start.durationMs / start.participantCount) >= slotFloorMs);
  assert.equal(new Set(start.acousticPlan.map((signature) => signature.code)).size, start.participantCount);

  hub.close();
});

test("extending the ceremony window raises the cohort ceiling", () => {
  const hub = createHub({ proximitySessionDurationMs: 4800 });
  // 4800 / 600 = 8, so the default cohort follows the larger ceiling.
  assert.equal(hub.proximityCohortCeiling, 8);
  assert.equal(hub.maxProximitySessionClients, 8);
  hub.close();
});

test("a reciprocal pair built through the real join + start flow matches", () => {
  const hub = createHub();
  const a = joinOne(hub, "client-a");
  const b = joinOne(hub, "client-b");
  const session = hub.findProximitySessionForClient(a.id);

  startAndAnchor(hub, session);
  hub.recordProximitySessionTelemetry(a, reciprocalMessage(session, a, b));
  hub.recordProximitySessionTelemetry(b, reciprocalMessage(session, b, a));

  assert.ok(a.pairingId);
  assert.equal(a.pairingId, b.pairingId);
  assert.equal(messagesOf(a, "proximity:match")[0].payload.peerId, "client-b");
  assert.equal(messagesOf(b, "proximity:match")[0].payload.peerId, "client-a");

  hub.close();
});

test("the global participant cap rejects joins beyond it cleanly", () => {
  const hub = createHub({ maxTotalProximityParticipants: 4, maxProximitySessionClients: 2 });
  joinMany(hub, 4);
  assert.equal(hub.totalProximityParticipants(), 4);
  assert.equal(hub.proximitySessions.size, 2);

  const rejected = joinOne(hub, "client-overflow");
  const failure = messagesOf(rejected, "proximity:session:failed").at(-1);
  assert.equal(failure.payload.reason, "capacity_reached");
  assert.equal(failure.payload.maxTotalParticipants, 4);
  // The rejected client is not stored in any session and the cap is respected.
  assert.equal(hub.findProximitySessionForClient(rejected.id), null);
  assert.equal(hub.totalProximityParticipants(), 4);
  assert.equal(messagesOf(rejected, "proximity:session:joined").length, 0);

  hub.close();
});

test("two concurrent sessions each match their own pair independently", () => {
  const hub = createHub({ maxProximitySessionClients: 2 });
  const a1 = joinOne(hub, "a1");
  const a2 = joinOne(hub, "a2");
  const b1 = joinOne(hub, "b1");
  const b2 = joinOne(hub, "b2");

  const sessionA = hub.findProximitySessionForClient(a1.id);
  const sessionB = hub.findProximitySessionForClient(b1.id);
  assert.notEqual(sessionA.id, sessionB.id);
  assert.equal(sessionA.clients.size, 2);
  assert.equal(sessionB.clients.size, 2);
  assert.ok(sessionA.clients.has(a2.id));
  assert.ok(sessionB.clients.has(b2.id));

  startAndAnchor(hub, sessionA);
  startAndAnchor(hub, sessionB);
  hub.recordProximitySessionTelemetry(a1, reciprocalMessage(sessionA, a1, a2));
  hub.recordProximitySessionTelemetry(a2, reciprocalMessage(sessionA, a2, a1));
  hub.recordProximitySessionTelemetry(b1, reciprocalMessage(sessionB, b1, b2));
  hub.recordProximitySessionTelemetry(b2, reciprocalMessage(sessionB, b2, b1));

  assert.ok(a1.pairingId);
  assert.equal(a1.pairingId, a2.pairingId);
  assert.ok(b1.pairingId);
  assert.equal(b1.pairingId, b2.pairingId);
  assert.notEqual(a1.pairingId, b1.pairingId);
  assert.equal(messagesOf(a1, "proximity:match")[0].payload.peerId, "a2");
  assert.equal(messagesOf(b1, "proximity:match")[0].payload.peerId, "b2");

  hub.close();
});

test("concurrent cohorts are pinned to different acoustic sub-bands when the band is wide enough", () => {
  // Widen the usable band (2400 Hz) and lower the per-lane minimum so several
  // sub-bands fit; concurrent cohorts then land on distinct frequency lanes.
  const hub = createHub({
    maxProximitySessionClients: 2,
    acousticBandStartHz: 18600,
    acousticBandEndHz: 21000,
    acousticMinBandwidthHz: 600,
    acousticMaxConcurrentSubBands: 4
  });
  const a1 = joinOne(hub, "a1");
  joinOne(hub, "a2");
  const b1 = joinOne(hub, "b1");
  joinOne(hub, "b2");

  const sessionA = hub.findProximitySessionForClient(a1.id);
  const sessionB = hub.findProximitySessionForClient(b1.id);
  hub.startProximitySession(sessionA.id);
  hub.startProximitySession(sessionB.id);

  assert.equal(sessionA.acousticBand.count, 4);
  assert.notEqual(sessionA.acousticBand.index, sessionB.acousticBand.index);
  assert.notEqual(sessionA.acousticBand.startFrequencyHz, sessionB.acousticBand.startFrequencyHz);
  // Within a single cohort every participant still shares one band.
  const startA = firstStart(hub, sessionA);
  assert.equal(new Set(startA.acousticPlan.map((signature) => `${signature.startFrequencyHz}-${signature.endFrequencyHz}`)).size, 1);

  hub.close();
});

test("an unconfigured cohort cap follows the ceiling when the runtime policy retunes the window", () => {
  const hub = createHub();
  assert.equal(hub.maxProximitySessionClients, 6); // 3600ms window / 600ms floor
  hub.updateRuntimeProximityPolicy({ timing: { acousticWindowMs: 6000 } });
  // Pre-fix this stayed latched at 6 (the constructor-time ceiling), splitting
  // a 10-person burst into two cohorts for no reason.
  assert.equal(hub.proximityCohortCeiling, 10);
  assert.equal(hub.maxProximitySessionClients, 10);
  hub.close();

  // An EXPLICIT operator cap stays fixed (only re-clamped to the ceiling).
  const capped = createHub({ maxProximitySessionClients: 4 });
  capped.updateRuntimeProximityPolicy({ timing: { acousticWindowMs: 6000 } });
  assert.equal(capped.maxProximitySessionClients, 4);
  capped.close();
});

test("stagger reflects ceremonies actually in flight: zero for a lone cohort, capped growth beyond", () => {
  const hub = createHub();
  // Burn the start counter: the old counter-mod-phases scheme would hand the
  // NEXT (lone) cohort a nonzero phase; overlap-based stagger must not.
  hub.proximityStartCounter = 7;

  const startCohort = (prefix) => {
    joinOne(hub, `${prefix}-a`);
    joinOne(hub, `${prefix}-b`);
    const session = hub.findProximitySessionForClient(`${prefix}-a`);
    hub.startProximitySession(session.id);
    return session;
  };

  assert.equal(startCohort("solo").staggerMs, 0);
  // Second/third cohorts overlap the ones before them → one step each.
  assert.equal(startCohort("second").staggerMs, 1200);
  assert.equal(startCohort("third").staggerMs, 2400);
  // Capped at (phases-1) steps — NOT wrapped back to 0 like counter-mod-3 did.
  assert.equal(startCohort("fourth").staggerMs, 2400);

  hub.close();
});

test("cohorts above 2 get slot-spaced bump cues and a window that covers the last turn", () => {
  const hub = createHub();
  const duoClients = [joinOne(hub, "duo-0"), joinOne(hub, "duo-1")];
  const duo = hub.findProximitySessionForClient("duo-0");
  hub.startProximitySession(duo.id);
  for (const client of duoClients) {
    const start = messagesOf(client, "proximity:session:start")[0].payload;
    // A lone pair keeps one shared beat — there is no ambiguity to separate.
    assert.equal(start.bumpCueAt, start.startAt + 900);
    assert.equal(start.bumpCueSpacingMs, 0);
  }

  const quad = Array.from({ length: 4 }, (_, index) => joinOne(hub, `quad-${index}`));
  const quadSession = hub.findProximitySessionForClient("quad-0");
  hub.startProximitySession(quadSession.id);
  const starts = quad
    .map((client) => messagesOf(client, "proximity:session:start")[0].payload)
    .sort((a, b) => a.acousticSlot - b.acousticSlot);
  starts.forEach((start, index) => {
    assert.equal(start.bumpCueAt, start.startAt + 900 + index * 1500);
    assert.equal(start.bumpCueSpacingMs, 1500);
    // The stretched window covers the last cue + reaction tail, and every
    // acoustic slot stays at/above the 600ms floor.
    assert.ok(start.durationMs >= 900 + 3 * 1500 + 2600);
    assert.ok(Math.floor(start.durationMs / start.participantCount) >= 600);
    assert.ok(start.bumpCueAt + 2000 <= start.startAt + start.durationMs);
  });

  hub.close();
});

test("split pairs get a regroup hint on failure — live foreign bumps and tombstones both count", () => {
  const hub = createHub();
  // Two true pairs, each split across cohorts by arrival order:
  // A = {a1, a2}, B = {b1, b2}; a1's physical partner is b1, a2's is b2.
  const a1 = joinOne(hub, "a1");
  const a2 = joinOne(hub, "a2");
  const sessionA = hub.findProximitySessionForClient("a1");
  hub.startProximitySession(sessionA.id);
  const b1 = joinOne(hub, "b1");
  const b2 = joinOne(hub, "b2");
  const sessionB = hub.findProximitySessionForClient("b1");
  hub.startProximitySession(sessionB.id);
  startAndAnchor(hub, sessionA);
  startAndAnchor(hub, sessionB);

  const base = sessionA.startAt + 400;
  // Within each cohort the strangers hear each other (same room) but the
  // bumps betray the split: a1/b1 share one physical bump, a2/b2 another 2s
  // later. The a1-a2 candidate is then vetoed (b1's bump sits 60ms from a1's,
  // far closer than their own 2000ms delta).
  hub.recordProximitySessionTelemetry(a1, bumpedMessage(sessionA, a1, a2, base));
  hub.recordProximitySessionTelemetry(a2, bumpedMessage(sessionA, a2, a1, base + 2000));
  hub.recordProximitySessionTelemetry(b1, bumpedMessage(sessionB, b1, b2, base + 60));
  hub.recordProximitySessionTelemetry(b2, bumpedMessage(sessionB, b2, b1, base + 2060));

  hub.failUnmatchedProximitySession(sessionA.id);
  for (const client of [a1, a2]) {
    const failed = messagesOf(client, "proximity:session:failed").at(-1).payload;
    assert.equal(failed.regroup, true, `${client.id} should be told to regroup`);
    // Cohort B is still in flight, so A's rejoin must be ALIGNED past B's fail
    // moment (endsAt + slop from now) — not the bare 700ms base, which would
    // let A's two stranger-members re-pair with each other before B's members
    // ever arrive.
    assert.ok(failed.retryAfterMs > 4000, `aligned rejoin, got ${failed.retryAfterMs}`);
    assert.ok(failed.retryAfterMs <= 12000);
  }

  // Cohort B fails after A was torn down: A's bumps survive only as
  // tombstones, the hint must still fire off them, and with no other cohort
  // in flight the rejoin delay is the plain base.
  hub.failUnmatchedProximitySession(sessionB.id);
  for (const client of [b1, b2]) {
    const failed = messagesOf(client, "proximity:session:failed").at(-1).payload;
    assert.equal(failed.regroup, true, `${client.id} should regroup via tombstones`);
    assert.equal(failed.retryAfterMs, 700);
  }

  // Control: a failing cohort whose bump coincides with NO foreign bump gets
  // a plain honest failure, not a regroup hint.
  const c1 = joinOne(hub, "c1");
  joinOne(hub, "c2");
  const sessionC = hub.findProximitySessionForClient("c1");
  hub.startProximitySession(sessionC.id);
  startAndAnchor(hub, sessionC);
  hub.recordProximitySessionTelemetry(c1, bumpedMessage(sessionC, c1, hub.clients.get("c2"), sessionC.startAt + 6000));
  hub.failUnmatchedProximitySession(sessionC.id);
  const failedC = messagesOf(c1, "proximity:session:failed").at(-1).payload;
  assert.equal(failedC.regroup, false);
  assert.equal(failedC.retryAfterMs, null);

  hub.close();
});

test("a full 10-cohort's telemetry keeps every foreign detection entry", () => {
  const hub = createHub();
  hub.updateRuntimeProximityPolicy({ timing: { acousticWindowMs: 6000 } });
  const clients = joinMany(hub, 10);
  const session = hub.findProximitySessionForClient("client-0");
  assert.equal(session.clients.size, 10);
  startAndAnchor(hub, session);

  const sender = clients[0];
  const message = bumpedMessage(session, sender, clients[1], session.startAt + 500);
  // One detection per foreign signature — 9 entries at the full cohort. The
  // old MAX_ACOUSTIC_DETECTIONS of 8 (safe at cohort cap 6) silently dropped
  // the last one from the stored diagnostics (matching itself reads the
  // unsliced analysis list, so this is observability, not correctness).
  message.payload.metrics.acousticDetections = [...session.signatures.entries()]
    .filter(([clientId]) => clientId !== sender.id)
    .map(([, signatureId]) => ({ signatureId, correlation: 0.4, marginDb: 3, detectionMethod: "correlation" }));
  assert.equal(message.payload.metrics.acousticDetections.length, 9);
  hub.recordProximitySessionTelemetry(sender, message);
  const entry = session.telemetry.get(sender.id);
  assert.ok(entry, "telemetry accepted");
  assert.equal(entry.acoustic.detections.length, 9);
  assert.equal(entry.analysis.acousticDetections.length, 9);

  hub.close();
});

function createHub(options = {}) {
  return new SignalingHub({
    server: { on() {} },
    proximityAnalyzer: new ProximityScoreAnalyzer({ enabled: false }),
    ...options
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

function joinOne(hub, id) {
  const client = hub.clients.get(id) || addClient(hub, id);
  hub.joinProximitySession(client, {
    payload: { clientNonce: `nonce-${id}`, acousticCapabilities: {} }
  });
  return client;
}

function joinMany(hub, count) {
  return Array.from({ length: count }, (_, index) => joinOne(hub, `client-${index}`));
}

// Real startProximitySession schedules startAt ~1.2s in the future. For a
// synchronous unit test, anchor the timing window to "now" so telemetry passes
// the ceremony-timing gate without waiting on timers.
function startAndAnchor(hub, session) {
  hub.startProximitySession(session.id);
  session.startAt = Date.now() - 50;
  session.endsAt = Date.now() + 5000;
}

function reciprocalMessage(session, sender, heard) {
  return {
    payload: {
      sessionId: session.id,
      clientNonce: session.nonces.get(sender.id),
      metrics: {
        acoustic: true,
        soundCorrelation: 1,
        motionCorrelation: 1,
        bump: true,
        tilt: true,
        acousticConfidenceMargin: 0.5,
        acousticSignatureId: session.signatures.get(sender.id),
        heardAcousticSignatureId: session.signatures.get(heard.id)
      },
      timing: {
        startedAt: session.startAt,
        bumpAt: session.startAt + 50,
        completedAt: session.startAt + 100
      }
    }
  };
}

// Reciprocal verified telemetry with an explicit bump time (the crossed-split
// scenarios need bumps parked at specific offsets inside the window).
function bumpedMessage(session, sender, heard, bumpAt) {
  return {
    payload: {
      sessionId: session.id,
      clientNonce: session.nonces.get(sender.id),
      metrics: {
        acoustic: true,
        soundCorrelation: 1,
        motionCorrelation: 1,
        bump: true,
        tilt: true,
        acousticConfidenceMargin: 0.5,
        acousticSignatureId: session.signatures.get(sender.id),
        heardAcousticSignatureId: session.signatures.get(heard.id)
      },
      timing: {
        startedAt: session.startAt,
        bumpAt,
        completedAt: Math.max(session.startAt + 100, bumpAt + 50)
      }
    }
  };
}

function firstStart(hub, session) {
  const clientId = [...session.clients][0];
  const client = hub.clients.get(clientId);
  return messagesOf(client, "proximity:session:start")[0].payload;
}

function messagesOf(client, type) {
  return client.socket.messages.filter((message) => message.type === type);
}

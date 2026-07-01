import assert from "node:assert/strict";
import test from "node:test";

import {
  createTestRun,
  ingestTestRun,
  stopTestRun,
  summarizeTestRun,
  validateAssignments
} from "../js/admin/test-runs.js";

const assignments = { "phone-a": "A", "phone-b": "A", "phone-c": "B", "phone-d": "B" };

test("test-run recorder counts correct and cross-pair matches against the assigned devices", () => {
  let run = createTestRun({
    caseId: "simultaneous-pairs",
    assignments,
    policy: { revision: 8 },
    targetAttempts: 10,
    startedAt: 1000,
    devices: Object.keys(assignments).map((id) => ({ id, deviceName: id }))
  });
  run = ingestTestRun(run, [
    telemetry("session-1", "phone-a", 1100, 0.88, 2000),
    telemetry("session-1", "phone-b", 1150, 0.82, 2075),
    event("proximity:session:matched", 1200, { sessionId: "session-1", clientIds: ["phone-a", "phone-b"], score: 0.82 }),
    telemetry("session-2", "phone-c", 1300, 0.7, 3000),
    telemetry("session-2", "phone-a", 1350, 0.67, 3500),
    event("proximity:session:matched", 1400, { sessionId: "session-2", clientIds: ["phone-a", "phone-c"], score: 0.67 })
  ]);
  const summary = summarizeTestRun(run);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.correctPairs, 1);
  assert.equal(summary.wrongPairs, 1);
  assert.equal(summary.acousticPass, 100);
  assert.equal(summary.bumpPass, 100);
  assert.equal(summary.tiltPass, 100);
  assert.equal(summary.medianBumpDeltaMs, 75);
  assert.equal(run.policy.revision, 8);
});

test("test-run recorder de-duplicates polled events and saves failed sessions", () => {
  let run = createTestRun({
    caseId: "top-edge",
    assignments: { "phone-a": "A", "phone-b": "A" },
    startedAt: 1000
  });
  const failure = event("proximity:session:failed", 1500, {
    sessionId: "session-fail",
    clientId: "phone-a",
    reason: "acoustic_not_detected",
    score: 0.32
  });
  run = ingestTestRun(run, [failure, failure]);
  run = ingestTestRun(run, [failure]);
  run = stopTestRun(run, 2000);
  const summary = summarizeTestRun(run);
  assert.equal(summary.sessions, 1);
  assert.equal(summary.failed, 1);
  assert.equal(run.status, "complete");
  assert.equal(run.seenEvents.length, 1);
});

test("assignment validation enforces one or two complete intended pairs", () => {
  assert.equal(validateAssignments("top-edge", { a: "A", b: "A" }).valid, true);
  assert.equal(validateAssignments("top-edge", assignments).valid, false);
  assert.equal(validateAssignments("simultaneous-pairs", assignments).valid, true);
  assert.equal(validateAssignments("simultaneous-pairs", { a: "A", b: "A", c: "B" }).valid, false);
});

function telemetry(sessionId, clientId, at, score, bumpAt) {
  return event("proximity:session:telemetry", at, {
    sessionId,
    clientId,
    deviceName: clientId,
    score,
    acousticDetected: true,
    bumpCorrelation: 1,
    tiltMatch: 1,
    bumpAt
  });
}

function event(type, at, detail) {
  return { type, at: new Date(at).toISOString(), detail };
}

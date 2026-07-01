export const TEST_CASES = Object.freeze([
  {
    id: "top-edge",
    title: "Top edge to top edge",
    shortTitle: "Top edges",
    pairCount: 1,
    targetAttempts: 10,
    purpose: "Baseline the strongest likely microphone-to-microphone contact geometry.",
    procedure: "Align the top edges near the camera and earpiece, tap Connect, then make one clean contact. Repeat without changing the room or device cases."
  },
  {
    id: "speaker-microphone",
    title: "Speaker to microphone",
    shortTitle: "Speaker ↔ mic",
    pairCount: 1,
    targetAttempts: 10,
    purpose: "Measure the directional advantage of pointing one phone speaker toward the other phone microphone.",
    procedure: "Place the media-speaker edge of one phone against the microphone edge of the other. Swap phone roles after five attempts."
  },
  {
    id: "cross-angle",
    title: "Cross-angle contact",
    shortTitle: "Cross angle",
    pairCount: 1,
    targetAttempts: 10,
    purpose: "Measure attenuation when the two phones meet diagonally instead of face-on.",
    procedure: "Hold both devices at roughly 45 degrees, cross their side edges, tap Connect, and make one clean contact. Alternate which phone sits above."
  },
  {
    id: "tap-delay",
    title: "Delayed tap sweep",
    shortTitle: "Tap delay",
    pairCount: 1,
    targetAttempts: 12,
    purpose: "Find the practical limit of the late-tap grace without changing physical geometry.",
    procedure: "Use the top-edge baseline. Run two attempts each at 0, 0.5, 1, 1.5, 3, and 5 seconds between the two Connect taps."
  },
  {
    id: "simultaneous-pairs",
    title: "Two pairs simultaneously",
    shortTitle: "Two pairs",
    pairCount: 2,
    targetAttempts: 10,
    purpose: "Prove that reciprocal coded ultrasound keeps two concurrent pairs from crossing.",
    procedure: "Place Pair A and Pair B about five metres apart. All four people tap Connect within one second, then each intended pair makes contact. Rotate pair positions halfway through."
  },
  {
    id: "negative-control",
    title: "Negative-control isolation",
    shortTitle: "Negative control",
    pairCount: 2,
    targetAttempts: 10,
    purpose: "Measure false matches when a stronger nearby signal or incomplete physical evidence is present.",
    procedure: "Run one intended pair while the second pair joins but does not bump, then swap. A no-bump, no-tilt, or non-reciprocal device must never connect."
  },
  {
    id: "noisy-room",
    title: "Noisy-room repeat",
    shortTitle: "Noisy room",
    pairCount: 1,
    targetAttempts: 10,
    purpose: "Separate geometry failures from high-frequency environmental noise and phone processing differences.",
    procedure: "Repeat the top-edge baseline with normal conversation or music nearby. Keep distance, cases, and tap timing unchanged from the quiet baseline."
  }
]);

export function createTestRun({
  caseId,
  assignments = {},
  policy,
  targetAttempts,
  notes = "",
  devices = [],
  startedAt = Date.now()
} = {}) {
  const definition = TEST_CASES.find((entry) => entry.id === caseId) || TEST_CASES[0];
  const selectedAssignments = Object.fromEntries(
    Object.entries(assignments).filter(([, pair]) => pair === "A" || pair === "B")
  );
  const requestedAttempts = Number(targetAttempts);
  const safeTargetAttempts = Number.isFinite(requestedAttempts)
    ? Math.floor(requestedAttempts)
    : definition.targetAttempts;
  return {
    id: `run-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    caseId: definition.id,
    caseTitle: definition.title,
    status: "active",
    startedAt,
    stoppedAt: null,
    targetAttempts: Math.max(1, Math.min(100, safeTargetAttempts)),
    notes: String(notes || "").slice(0, 500),
    assignments: selectedAssignments,
    devices: devices
      .filter((device) => selectedAssignments[device.id])
      .map((device) => ({
        id: device.id,
        deviceName: device.deviceName || device.name || device.id,
        deviceFamily: device.deviceFamily || "device",
        pair: selectedAssignments[device.id]
      })),
    policy: policy ? structuredClone(policy) : null,
    seenEvents: [],
    sessions: {}
  };
}

export function ingestTestRun(run, events = []) {
  if (!run || run.status !== "active") return run;
  const next = structuredClone(run);
  const seen = new Set(next.seenEvents || []);
  const assignedIds = new Set(Object.keys(next.assignments || {}));
  const sorted = [...(Array.isArray(events) ? events : [])]
    .sort((a, b) => eventTime(a) - eventTime(b));
  for (const event of sorted) {
    if (eventTime(event) < Number(next.startedAt || 0)) continue;
    const detail = event?.detail || {};
    const relatedIds = eventClientIds(event);
    if (!relatedIds.some((id) => assignedIds.has(id))) continue;
    if (!["proximity:session:telemetry", "proximity:session:matched", "proximity:session:failed"].includes(event.type)) continue;
    const fingerprint = eventFingerprint(event);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const sessionId = String(detail.sessionId || `unknown-${fingerprint}`);
    const session = next.sessions[sessionId] || {
      sessionId,
      firstAt: event.at || new Date(eventTime(event)).toISOString(),
      lastAt: event.at || new Date(eventTime(event)).toISOString(),
      telemetry: {},
      matches: [],
      failures: []
    };
    session.lastAt = event.at || session.lastAt;
    if (event.type === "proximity:session:telemetry" && detail.clientId) {
      session.telemetry[detail.clientId] = {
        clientId: detail.clientId,
        deviceName: detail.deviceName || detail.clientId,
        score: Number(detail.score || 0),
        acousticDetected: Boolean(detail.acousticDetected),
        bumpDetected: Number(detail.bumpCorrelation || 0) >= 0.5,
        tiltDetected: Number(detail.tiltMatch || 0) >= 0.5,
        bumpAt: Number(detail.bumpAt || 0),
        startedAt: Number(detail.startedAt || 0),
        completedAt: Number(detail.completedAt || 0),
        policyRevision: Number(detail.policyRevision || next.policy?.revision || 1)
      };
    }
    if (event.type === "proximity:session:matched") {
      const pair = (Array.isArray(detail.clientIds) ? detail.clientIds : []).map(String).sort();
      const pairKey = pair.join("|");
      if (pair.length === 2 && !session.matches.some((match) => match.pairKey === pairKey)) {
        session.matches.push({
          pairKey,
          clientIds: pair,
          score: Number(detail.score || 0),
          correct: expectedPairKeys(next.assignments).has(pairKey)
        });
      }
    }
    if (event.type === "proximity:session:failed") {
      const failureKey = `${detail.clientId || "session"}:${detail.reason || "failed"}`;
      if (!session.failures.some((failure) => failure.key === failureKey)) {
        session.failures.push({
          key: failureKey,
          clientId: detail.clientId || null,
          reason: detail.reason || "failed",
          score: Number(detail.score || 0)
        });
      }
    }
    next.sessions[sessionId] = session;
  }
  next.seenEvents = [...seen].slice(-500);
  return next;
}

export function stopTestRun(run, stoppedAt = Date.now()) {
  if (!run) return null;
  return { ...structuredClone(run), status: "complete", stoppedAt };
}

export function summarizeTestRun(run) {
  const sessions = Object.values(run?.sessions || {});
  const matches = sessions.flatMap((session) => session.matches || []);
  const telemetry = sessions.flatMap((session) => Object.values(session.telemetry || {}));
  const failedSessions = sessions.filter((session) => (session.failures || []).length > 0 && !(session.matches || []).length);
  const bumpDeltas = sessions.flatMap((session) => expectedBumpDeltas(run, session));
  const correctPairs = matches.filter((match) => match.correct).length;
  const wrongPairs = matches.filter((match) => !match.correct).length;
  return {
    sessions: sessions.length,
    correctPairs,
    wrongPairs,
    failed: failedSessions.length,
    acousticPass: rate(telemetry, (entry) => entry.acousticDetected),
    bumpPass: rate(telemetry, (entry) => entry.bumpDetected),
    tiltPass: rate(telemetry, (entry) => entry.tiltDetected),
    medianScore: median(telemetry.map((entry) => entry.score * 100)),
    medianBumpDeltaMs: median(bumpDeltas),
    completedOutcomes: correctPairs + wrongPairs + failedSessions.length,
    targetAttempts: Number(run?.targetAttempts || 0)
  };
}

export function validateAssignments(caseId, assignments = {}) {
  const definition = TEST_CASES.find((entry) => entry.id === caseId) || TEST_CASES[0];
  const countA = Object.values(assignments).filter((pair) => pair === "A").length;
  const countB = Object.values(assignments).filter((pair) => pair === "B").length;
  if (countA !== 2) return { valid: false, message: "Assign exactly two connected devices to Pair A." };
  if (definition.pairCount === 2 && countB !== 2) {
    return { valid: false, message: "This case needs exactly two devices in Pair A and two in Pair B." };
  }
  if (definition.pairCount === 1 && countB !== 0) {
    return { valid: false, message: "This case uses one pair. Remove the Pair B assignments." };
  }
  return { valid: true, message: "" };
}

function expectedPairKeys(assignments = {}) {
  const groups = new Map();
  for (const [clientId, pair] of Object.entries(assignments)) {
    const ids = groups.get(pair) || [];
    ids.push(clientId);
    groups.set(pair, ids);
  }
  return new Set([...groups.values()].filter((ids) => ids.length === 2).map((ids) => ids.sort().join("|")));
}

function expectedBumpDeltas(run, session) {
  const telemetry = session.telemetry || {};
  const deltas = [];
  for (const pairKey of expectedPairKeys(run?.assignments)) {
    const [firstId, secondId] = pairKey.split("|");
    const first = Number(telemetry[firstId]?.bumpAt || 0);
    const second = Number(telemetry[secondId]?.bumpAt || 0);
    if (first > 0 && second > 0) deltas.push(Math.abs(first - second));
  }
  return deltas;
}

function eventClientIds(event) {
  const detail = event?.detail || {};
  return [
    ...(Array.isArray(detail.clientIds) ? detail.clientIds : []),
    detail.clientId,
    detail.targetId
  ].filter(Boolean).map(String);
}

function eventFingerprint(event) {
  const detail = event?.detail || {};
  return [
    event.type,
    event.at || event.timestamp || "",
    detail.sessionId || "",
    detail.clientId || "",
    (detail.clientIds || []).join?.("|") || "",
    detail.reason || ""
  ].join("::");
}

function eventTime(event) {
  const parsed = Date.parse(event?.at);
  return Number.isFinite(parsed) ? parsed : Number(event?.timestamp || 0);
}

function rate(entries, predicate) {
  if (!entries.length) return null;
  return Math.round(entries.filter(predicate).length / entries.length * 1000) / 10;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
}

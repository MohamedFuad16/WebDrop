import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import WebSocket from "ws";
import { ProximityScoreAnalyzer } from "../src/proximity-score.js";
import { createWebDropServer } from "../src/server.js";

let server;
let hub;
let baseUrl;

beforeEach(async () => {
  const created = createWebDropServer({
    env: {
      HOST: "127.0.0.1",
      PORT: "0",
      ALLOW_STUN_FALLBACK: "true",
      ENABLE_PROXIMITY_ANALYSIS: "false"
    },
    logger: silentLogger()
  });
  server = created.server;
  hub = created.hub;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  hub?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("proximity analyzer scores signals but does not enforce by default", () => {
  const analyzer = new ProximityScoreAnalyzer({ enabled: false });
  const analysis = analyzer.analyze({
    soundCorrelation: 0.9,
    motionCorrelation: 0.8,
    bumpCorrelation: 0.7,
    tiltMatch: 0.6,
    qrMatch: 1
  });

  assert.equal(analysis.enabled, false);
  assert.equal(analysis.decision, "not_enforced");
  assert.ok(analysis.score > 0.75);
  assert.equal(analysis.confidence, "high");
});

test("proximity policy endpoint is report-only by default", async () => {
  const response = await fetch(`${baseUrl}/api/proximity-policy`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.proximity.enabled, false);
  assert.equal(body.proximity.mode, "report-only");
  assert.equal(body.permissions.browserPermissionsRequestedByServer, false);
  assert.equal(body.permissions.proximityAnalysisEnabled, false);
});

test("proximity telemetry is routed with disabled analysis metadata", async () => {
  const alice = await connectClient("alice-prox", "Alice");
  const bob = await connectClient("bob-prox", "Bob");

  alice.sendJson({ type: "invite", targetId: "bob-prox", payload: { note: "nearby" } });
  const invite = await bob.nextOfType("invite");
  bob.sendJson({ type: "invite:accept", targetId: "alice-prox", pairingId: invite.payload.pairingId });
  const accepted = await alice.nextOfType("invite:accept");

  alice.sendJson({
    type: "proximity:telemetry",
    targetId: "bob-prox",
    pairingId: accepted.payload.pairingId,
    metrics: {
      soundCorrelation: 0.9,
      motionCorrelation: 0.3,
      bumpCorrelation: 0.7
    }
  });

  const telemetry = await bob.nextOfType("proximity:telemetry");
  assert.equal(telemetry.payload.analysis.enabled, false);
  assert.equal(telemetry.payload.analysis.decision, "not_enforced");
  assert.equal(telemetry.payload.analysis.score, undefined);

  alice.close();
  bob.close();
});

async function connectClient(id, deviceName) {
  const socket = new WebSocket(baseUrl.replace("http:", "ws:") + "/ws");
  const messages = [];
  const waiters = [];
  socket.on("message", (data) => {
    const parsed = JSON.parse(data.toString());
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
    sendJson(message) {
      socket.send(JSON.stringify(message));
    },
    nextOfType,
    close() {
      socket.close();
    }
  };

  async function nextOfType(type) {
    const existing = messages.find((message) => message.type === type);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${type}. Received ${messages.map((message) => message.type).join(", ")}`));
      }, 2500);
      const check = () => {
        const message = messages.find((candidate) => candidate.type === type);
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

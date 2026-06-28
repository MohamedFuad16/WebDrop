import test from "node:test";
import assert from "node:assert/strict";
import { SignalingHub } from "../src/signaling-hub.js";
import { ProximityScoreAnalyzer } from "../src/proximity-score.js";

test("TURN access tokens authenticate via index and are revoked on disconnect", () => {
  const hub = createHub();
  const socket = mockSocket();
  hub.registerClient(socket, hello("client-a"));
  const client = hub.clients.get("client-a");
  const token = client.turnAccessToken;

  assert.ok(token);
  assert.equal(hub.authenticateTurnRequest(token, "client-a"), client);
  assert.equal(hub.authenticateTurnRequest(token), client);
  assert.equal(hub.authenticateTurnRequest(token, "someone-else"), null);
  assert.equal(hub.authenticateTurnRequest("not-a-real-token"), null);
  assert.equal(hub.authenticateTurnRequest(""), null);

  hub.removeClient(socket, "test");
  assert.equal(hub.authenticateTurnRequest(token, "client-a"), null);
  assert.equal(hub.turnTokens.size, 0);

  hub.close();
});

test("a reconnecting client id keeps exactly one live TURN token", () => {
  const hub = createHub();
  const first = mockSocket();
  hub.registerClient(first, hello("client-a"));
  const firstToken = hub.clients.get("client-a").turnAccessToken;

  const second = mockSocket();
  hub.registerClient(second, hello("client-a"));
  const secondToken = hub.clients.get("client-a").turnAccessToken;

  assert.notEqual(firstToken, secondToken);
  assert.equal(hub.turnTokens.size, 1);
  assert.equal(hub.authenticateTurnRequest(firstToken), null);
  assert.equal(hub.authenticateTurnRequest(secondToken, "client-a"), hub.clients.get("client-a"));

  hub.close();
});

test("broadcast sends one frame to every open peer and skips closed/excepted sockets", () => {
  const hub = createHub();
  const a = mockSocket();
  const b = mockSocket();
  const c = mockSocket();
  hub.registerClient(a, hello("client-a"));
  hub.registerClient(b, hello("client-b"));
  hub.registerClient(c, hello("client-c"));
  c.readyState = 3; // CLOSED

  for (const socket of [a, b, c]) socket.messages.length = 0;
  hub.broadcast("diag:test", { value: 7 });

  assert.equal(received(a, "diag:test").length, 1);
  assert.equal(received(b, "diag:test").length, 1);
  assert.deepEqual(received(a, "diag:test")[0].payload, { value: 7 });
  assert.equal(received(c, "diag:test").length, 0);

  for (const socket of [a, b]) socket.messages.length = 0;
  hub.broadcast("diag:test", { value: 9 }, { exceptId: "client-a" });
  assert.equal(received(a, "diag:test").length, 0);
  assert.equal(received(b, "diag:test").length, 1);

  hub.close();
});

test("close clears pending proximity session timers and state", () => {
  const hub = createHub();
  const socket = mockSocket();
  hub.registerClient(socket, hello("client-a"));
  hub.joinProximitySession(hub.clients.get("client-a"), {
    payload: { clientNonce: "nonce-a", acousticCapabilities: {} }
  });

  assert.equal(hub.proximitySessions.size, 1);
  assert.equal(hub.openProximitySessionIds.size, 1);

  hub.close();

  assert.equal(hub.proximitySessions.size, 0);
  assert.equal(hub.openProximitySessionIds.size, 0);
});

function createHub() {
  return new SignalingHub({
    server: { on() {} },
    proximityAnalyzer: new ProximityScoreAnalyzer({ enabled: false })
  });
}

function mockSocket() {
  return {
    readyState: 1,
    messages: [],
    send(raw) {
      this.messages.push(JSON.parse(raw));
    },
    close() {
      this.readyState = 3;
    },
    ping() {},
    terminate() {
      this.readyState = 3;
    }
  };
}

function hello(id) {
  return {
    id,
    deviceId: id,
    deviceName: id,
    avatarId: null,
    avatar: null,
    deviceFamily: "ios",
    deviceLabel: "iPhone",
    ringColor: null,
    capabilities: {}
  };
}

function received(socket, type) {
  return socket.messages.filter((message) => message.type === type);
}

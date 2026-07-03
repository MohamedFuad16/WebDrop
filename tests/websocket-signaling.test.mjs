import assert from "node:assert/strict";
import test from "node:test";

import { WebSocketSignalingAdapter } from "../js/services/websocket-signaling.js";

test("fails a black-holed WebSocket handshake on the configured deadline", async () => {
  const timers = [];
  const failures = [];
  const adapter = new WebSocketSignalingAdapter({
    url: "wss://signal.example.test/ws",
    WebSocketImpl: FakeWebSocket,
    handshakeTimeoutMs: 8000,
    setTimeoutImpl(callback, delay) {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutImpl(timer) {
      if (timer) timer.cancelled = true;
    }
  });
  adapter.on("connection-failed", (event) => failures.push(event));

  const connection = adapter.connect({ self: { id: "deadline-test" } });
  assert.equal(timers[0].delay, 8000);
  timers[0].callback();

  assert.equal(await connection, false);
  assert.deepEqual(failures, [{ reason: "socket-handshake-timeout" }]);
  assert.equal(adapter.socket, null);
  assert.equal(timers.filter((timer) => !timer.cancelled).length, 1, "one reconnect timer should remain");

  await adapter.disconnect();
  assert.equal(timers.filter((timer) => !timer.cancelled).length, 0);
});

test("reports proximity session telemetry sends and skips closed sockets", async () => {
  const adapter = new WebSocketSignalingAdapter({
    url: "wss://signal.example.test/ws",
    WebSocketImpl: FakeWebSocket
  });
  const socket = new FakeWebSocket();
  socket.readyState = FakeWebSocket.OPEN;
  adapter.socket = socket;
  const skipped = [];
  adapter.on("send-skipped", (event) => skipped.push(event));

  assert.equal(await adapter.sendProximitySessionTelemetry({ sessionId: "prox-a" }), true);
  assert.deepEqual(JSON.parse(socket.sent[0]), {
    type: "proximity:session:telemetry",
    payload: { sessionId: "prox-a" }
  });

  socket.readyState = 3;
  assert.equal(await adapter.sendProximitySessionTelemetry({ sessionId: "prox-b" }), false);
  assert.equal(skipped[0].reason, "socket-not-open");
  assert.equal(skipped[0].messageType, "proximity:session:telemetry");
});

test("a 4001 takeover close goes terminally offline without reconnecting", async () => {
  const timers = [];
  const adapter = new WebSocketSignalingAdapter({
    url: "wss://signal.example.test/ws",
    WebSocketImpl: FakeWebSocket,
    setTimeoutImpl(callback, delay) {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutImpl(timer) { if (timer) timer.cancelled = true; }
  });
  const replaced = [];
  const disconnected = [];
  adapter.on("replaced", (event) => replaced.push(event));
  adapter.on("disconnected", (event) => disconnected.push(event));

  adapter.connect({ self: { id: "tab-a" } });
  const socket = adapter.socket;
  socket.readyState = FakeWebSocket.OPEN;
  socket.dispatch("open");
  // Server kicks this tab because a newer session took over.
  socket.dispatch("close", { code: 4001, reason: "replaced_by_new_device_session" });

  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].code, 4001);
  assert.equal(disconnected.length, 0, "must not emit disconnected / trigger reconnect");
  assert.equal(adapter.replaced, true);
  assert.equal(timers.filter((timer) => !timer.cancelled).length, 0, "no reconnect timer armed");

  // A plain connect() is a no-op while replaced; force reclaims the tab.
  assert.equal(await adapter.connect({ self: { id: "tab-a" } }), false);
  adapter.connect({ self: { id: "tab-a" } }, { force: true });
  assert.equal(adapter.replaced, false);
});

test("a forced reclaim with no payload re-sends the original client:hello identity", async () => {
  const adapter = new WebSocketSignalingAdapter({
    url: "wss://signal.example.test/ws",
    WebSocketImpl: FakeWebSocket
  });
  const original = { self: { id: "device-1-abc", name: "Moha" }, capabilities: { microphone: true } };

  // Initial connect stores the identity payload.
  adapter.connect(original);
  let socket = adapter.socket;
  socket.readyState = FakeWebSocket.OPEN;
  socket.dispatch("open");
  assert.deepEqual(JSON.parse(socket.sent[0]).payload, original, "first hello carries identity");
  await new Promise((resolve) => setTimeout(resolve, 0)); // let connectPromise .finally clear

  // Server takeover, then user reclaims THIS tab with connect(undefined, {force}).
  socket.dispatch("close", { code: 4001, reason: "replaced_by_new_connection" });
  adapter.connect(undefined, { force: true });
  socket = adapter.socket;
  socket.readyState = FakeWebSocket.OPEN;
  socket.dispatch("open");
  const reclaimHello = JSON.parse(socket.sent[0]);
  assert.equal(reclaimHello.type, "client:hello");
  assert.deepEqual(reclaimHello.payload, original, "reclaim hello must reuse the retained identity, not undefined");
  assert.equal(adapter.selfId, "device-1-abc");
});

class FakeWebSocket {
  static OPEN = 1;

  constructor() {
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = 3;
    this.dispatch("close", { code: 1006, reason: "" });
  }

  send(raw) {
    this.sent.push(raw);
  }

  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
}

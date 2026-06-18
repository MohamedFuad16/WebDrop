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

class FakeWebSocket {
  static OPEN = 1;

  constructor() {
    this.readyState = 0;
    this.listeners = new Map();
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

  send() {}

  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
}

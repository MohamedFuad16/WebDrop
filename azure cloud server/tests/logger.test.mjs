import test from "node:test";
import assert from "node:assert/strict";
import { redact } from "../src/logger.js";

test("redact masks secrets, SDP, and TURN material while keeping safe fields", () => {
  const redacted = redact({
    id: "client-a",
    deviceName: "Pixel 9",
    Authorization: "Bearer abc",
    turnAccessToken: "should-hide",
    credential: "turn-pass",
    iceServers: [{ urls: ["turn:turn.cloudflare.com:3478"], credential: "p" }],
    signal: {
      type: "offer",
      sdp: "v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\n"
    },
    nested: {
      apiToken: "x",
      ok: "value"
    }
  });

  assert.equal(redacted.id, "client-a");
  assert.equal(redacted.deviceName, "Pixel 9");
  assert.equal(redacted.Authorization, "[redacted]");
  assert.equal(redacted.turnAccessToken, "[redacted]");
  assert.equal(redacted.credential, "[redacted]");
  assert.equal(redacted.iceServers, "[redacted]");
  assert.equal(redacted.signal.type, "offer");
  assert.equal(redacted.signal.sdp, "[redacted]");
  assert.equal(redacted.nested.apiToken, "[redacted]");
  assert.equal(redacted.nested.ok, "value");
});

test("redact passes through primitives and arrays without throwing", () => {
  assert.equal(redact("plain"), "plain");
  assert.equal(redact(42), 42);
  assert.equal(redact(null), null);
  assert.deepEqual(redact([{ token: "x", keep: 1 }]), [{ token: "[redacted]", keep: 1 }]);
});

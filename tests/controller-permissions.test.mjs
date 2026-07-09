import assert from "node:assert/strict";
import test from "node:test";
import { __controllerTest } from "../js/core/controller.js";

test("stale cached microphone denial is normalized so Safari can re-prompt", () => {
  const previousStorage = globalThis.localStorage;
  const entries = new Map([
    ["webdrop.proximityPermissions", JSON.stringify({ microphone: "denied", motion: "denied" })]
  ]);
  globalThis.localStorage = {
    getItem(key) {
      return entries.get(key) ?? null;
    }
  };
  try {
    const permissions = __controllerTest.readStoredPermissions();
    assert.equal(permissions.microphone, "unknown");
    assert.equal(permissions.motion, "denied");
  } finally {
    if (previousStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousStorage;
    }
  }
});

test("microphone denials are not persisted as a local prompt blocker", () => {
  assert.equal(__controllerTest.microphonePermissionState({ granted: false, reason: "denied" }), "unknown");
  assert.equal(__controllerTest.microphonePermissionState({ granted: false, reason: "error" }), "unknown");
  assert.equal(__controllerTest.microphonePermissionState({ granted: false, reason: "unsupported" }), "unsupported");
  assert.equal(__controllerTest.microphonePermissionState({ granted: true }), "granted");
});

test("a denied motion or microphone permission blocks the ceremony with an actionable message", () => {
  const blocked = __controllerTest.blockedProximityPermissionKey;
  // The 07:07 field case: motion denied after a reload mid-session — the
  // ceremony is doomed (server requires bump+tilt) and iOS will not re-prompt
  // until a full page reload, so the flow must abort with the reload guidance.
  assert.deepEqual(blocked({ motion: { granted: false, reason: "denied" }, microphone: { granted: true } }),
    { key: "proximityErrorMotionDenied", params: {} });
  assert.deepEqual(blocked({ motion: { granted: false, reason: "error" }, microphone: { granted: true } }),
    { key: "proximityErrorMotionDenied", params: {} });
  assert.deepEqual(blocked({ motion: { granted: true }, microphone: { granted: false, reason: "denied" } }),
    { key: "proximityErrorMicrophoneDenied", params: {} });
  // Unknown reasons keep the generic message with the raw reason.
  assert.deepEqual(blocked({ motion: { granted: false, reason: "interrupted" }, microphone: { granted: true } }),
    { key: "proximityErrorMotion", params: { reason: "interrupted" } });
  // "unsupported" devices are NOT blocked — they use the QR fallback flows.
  assert.equal(blocked({ motion: { granted: false, reason: "unsupported" }, microphone: { granted: true } }), null);
  assert.equal(blocked({ motion: { granted: true }, microphone: { granted: true } }), null);
  assert.equal(blocked({}), null);
});

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

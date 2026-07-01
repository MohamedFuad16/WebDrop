import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PolicyValidationError, RuntimeProximityPolicy } from "../src/runtime-proximity-policy.js";

test("runtime proximity policy validates, revisions, and persists tuning", () => {
  const directory = mkdtempSync(join(tmpdir(), "webdrop-policy-"));
  const filePath = join(directory, "policy.json");
  try {
    const store = new RuntimeProximityPolicy({ filePath });
    const updated = store.update({
      scoring: {
        minimum: 60,
        weights: { sound: 30, motion: 22, bump: 25, tilt: 15, qr: 8 }
      },
      timing: { lateTapGraceMs: 7500, acousticWindowMs: 6500, matchSlopMs: 4500 }
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.scoring.weights.bump, 25);
    assert.equal(updated.timing.lateTapGraceMs, 7500);
    assert.equal(JSON.parse(readFileSync(filePath, "utf8")).revision, 2);

    const restored = new RuntimeProximityPolicy({ filePath }).snapshot();
    assert.deepEqual(restored, updated);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime proximity policy rejects weights that do not total 100", () => {
  const store = new RuntimeProximityPolicy();
  assert.throws(() => store.update({
    scoring: { weights: { bump: 40 } }
  }), PolicyValidationError);
});

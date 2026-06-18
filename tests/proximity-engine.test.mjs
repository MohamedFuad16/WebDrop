import assert from "node:assert/strict";
import test from "node:test";

import { proximityScore } from "../js/services/proximity-engine.js";

test("physical proximity requires every primary signal to exceed 90", () => {
  assert.equal(proximityScore({
    soundCorrelation: 1,
    motionCorrelation: 1,
    bump: true,
    tilt: true,
    qrFallback: false
  }), 92);

  assert.equal(proximityScore({
    soundCorrelation: 1,
    motionCorrelation: 1,
    bump: true,
    tilt: false,
    qrFallback: false
  }), 80);
});

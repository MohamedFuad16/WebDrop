import assert from "node:assert/strict";
import test from "node:test";

import { ProximityScoreAnalyzer } from "../src/proximity-score.js";

test("proximity analysis enforces a score strictly above 90 percent", () => {
  const analyzer = new ProximityScoreAnalyzer({ enabled: true });
  const verified = analyzer.analyze({
    soundCorrelation: 1,
    motionCorrelation: 1,
    bumpCorrelation: 1,
    tiltMatch: 1
  });
  const boundary = analyzer.analyze({
    soundCorrelation: 1,
    motionCorrelation: 1,
    bumpCorrelation: 1,
    tiltMatch: 5 / 6
  });

  assert.equal(verified.score, 0.92);
  assert.equal(verified.decision, "verified");
  assert.equal(boundary.score, 0.9);
  assert.notEqual(boundary.decision, "verified");
  assert.ok(boundary.failures.includes("tilt-not-detected"));
});

import assert from "node:assert/strict";
import test from "node:test";

import { ProximityScoreAnalyzer } from "../src/proximity-score.js";

test("proximity analysis accepts a minimum score of 55 percent", () => {
  const analyzer = new ProximityScoreAnalyzer({ enabled: true });
  const verified = analyzer.analyze({
    soundCorrelation: 1,
    motionCorrelation: 1,
    bumpCorrelation: 1,
    tiltMatch: 1
  });
  const minimum = analyzer.analyze({
    soundCorrelation: 1,
    motionCorrelation: 21 / 26
  });
  const belowMinimum = analyzer.analyze({
    soundCorrelation: 1,
    motionCorrelation: 20 / 26
  });

  assert.equal(verified.score, 0.92);
  assert.equal(verified.decision, "verified");
  assert.equal(minimum.score, 0.55);
  assert.equal(minimum.decision, "verified");
  assert.ok(belowMinimum.score < 0.55);
  assert.notEqual(belowMinimum.decision, "verified");
});

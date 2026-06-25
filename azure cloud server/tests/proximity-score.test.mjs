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
    motionCorrelation: (0.55 - 0.34) / 0.26
  });
  const belowMinimum = analyzer.analyze({
    soundCorrelation: 1,
    motionCorrelation: (0.55 - 0.34) / 0.26 - 0.01
  });

  assert.equal(Math.round(verified.score * 1000) / 1000, 0.92);
  assert.equal(verified.decision, "verified");
  assert.ok(Math.abs(minimum.score - 0.55) < 0.000001);
  assert.equal(minimum.decision, "verified");
  assert.ok(belowMinimum.score < 0.55);
  assert.notEqual(belowMinimum.decision, "verified");
});

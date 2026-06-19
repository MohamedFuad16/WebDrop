import test from "node:test";
import assert from "node:assert/strict";
import { ServerMetrics } from "../src/metrics.js";

test("metrics keep bounded recent diagnostic events", () => {
  const metrics = new ServerMetrics();
  for (let index = 0; index < 130; index += 1) {
    metrics.recordEvent("proximity:session:telemetry", { index });
  }

  const summary = metrics.summary({ activeClients: 2, activePairs: 1 });
  assert.equal(summary.activeClients, 2);
  assert.equal(summary.activePairs, 1);
  assert.equal(summary.events["proximity:session:telemetry"], 130);
  assert.equal(summary.recentEvents.length, 120);
  assert.equal(summary.recentEvents[0].detail.index, 129);
  assert.equal(summary.recentEvents[119].detail.index, 10);
});

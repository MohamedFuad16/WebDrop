import test from "node:test";
import assert from "node:assert/strict";
import { QrTokenProvider } from "../src/qr-token-provider.js";

test("peerless QR token pairs issuer and scanner without a preselected target", () => {
  const provider = new QrTokenProvider({ ttlMs: 120000 });
  const issued = provider.issue({
    pairingId: "qr-pair-a",
    issuerId: "client-a",
    targetId: null
  });

  const result = provider.verify({
    token: issued.token,
    pairingId: null,
    verifierId: "client-b",
    targetId: null
  });

  assert.equal(result.valid, true);
  assert.equal(result.issuerId, "client-a");
  assert.equal(result.verifierId, "client-b");
  assert.equal(result.pairingId, "qr-pair-a");
});

test("peerless QR token rejects self scans and replay", () => {
  const provider = new QrTokenProvider({ ttlMs: 120000 });
  const issued = provider.issue({
    pairingId: "qr-pair-a",
    issuerId: "client-a",
    targetId: null
  });

  const selfScan = provider.verify({
    token: issued.token,
    pairingId: issued.pairingId,
    verifierId: "client-a",
    targetId: null
  });
  const validScan = provider.verify({
    token: issued.token,
    pairingId: issued.pairingId,
    verifierId: "client-b",
    targetId: null
  });
  const replay = provider.verify({
    token: issued.token,
    pairingId: issued.pairingId,
    verifierId: "client-c",
    targetId: null
  });

  assert.equal(selfScan.valid, false);
  assert.equal(validScan.valid, true);
  assert.equal(replay.valid, false);
});

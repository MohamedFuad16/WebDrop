import assert from "node:assert/strict";
import { test } from "node:test";
import { QrTokenProvider } from "../src/qr-token-provider.js";

test("issues one-time QR tokens bound to a pairing and peer direction", () => {
  const provider = new QrTokenProvider({ ttlMs: 5000 });
  const issued = provider.issue({
    pairingId: "pair-a-b",
    issuerId: "a",
    targetId: "b"
  });

  const verified = provider.verify({
    token: issued.token,
    pairingId: "pair-a-b",
    verifierId: "b",
    targetId: "a"
  });
  assert.equal(verified.valid, true);

  const reused = provider.verify({
    token: issued.token,
    pairingId: "pair-a-b",
    verifierId: "b",
    targetId: "a"
  });
  assert.equal(reused.valid, false);
});

test("rejects QR tokens used by the wrong peer or pairing", () => {
  const provider = new QrTokenProvider({ ttlMs: 5000 });
  const issued = provider.issue({
    pairingId: "pair-a-b",
    issuerId: "a",
    targetId: "b"
  });

  assert.equal(provider.verify({
    token: issued.token,
    pairingId: "pair-a-c",
    verifierId: "c",
    targetId: "a"
  }).valid, false);
});

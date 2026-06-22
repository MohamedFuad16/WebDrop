import test from "node:test";
import assert from "node:assert/strict";
import { validateRoutedMessage } from "../src/message-schema.js";

test("rtc:signal SDP preserves line boundaries and avoids truncation", () => {
  const mediaLines = Array.from({ length: 700 }, (_, index) => `a=x-webdrop-test-${index}:0123456789`);
  const sdp = [
    "v=0",
    "o=- 46117326 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=mid:data",
    "a=sctp-port:5000",
    "a=max-message-size:262144",
    ...mediaLines
  ].join("\n");

  const routed = validateRoutedMessage({
    type: "rtc:signal",
    targetId: "peer-b",
    pairingId: "pair-a-b",
    signal: {
      type: "offer",
      sdp
    }
  });

  assert.equal(routed.signal.type, "offer");
  assert.match(routed.signal.sdp, /\r\na=max-message-size:262144\r\n/);
  assert.match(routed.signal.sdp, /\r\na=x-webdrop-test-699:0123456789\r\n/);
  assert.ok(routed.signal.sdp.length >= sdp.length);
});

test("proximity sessions and peerless QR do not require a preselected target", () => {
  const joined = validateRoutedMessage({
    type: "proximity:session:join",
    payload: { clientNonce: "nonce-a", acousticCapabilities: { sampleRate: 48000, strictInaudible: true } }
  });
  assert.equal(joined.targetId, null);
  assert.equal(joined.payload.clientNonce, "nonce-a");
  assert.equal(joined.payload.acousticCapabilities.sampleRate, 48000);

  const qrIssue = validateRoutedMessage({
    type: "proximity:qr:issue",
    payload: {}
  });
  assert.equal(qrIssue.targetId, null);

  const qrVerify = validateRoutedMessage({
    type: "proximity:qr:verify",
    payload: { token: "abc123" }
  });
  assert.equal(qrVerify.targetId, null);
  assert.equal(qrVerify.payload.token, "abc123");
});

test("proximity session telemetry preserves bounded reciprocal acoustic signatures", () => {
  const telemetry = validateRoutedMessage({
    type: "proximity:session:telemetry",
    payload: {
      sessionId: "session-a",
      clientNonce: "nonce-a",
      metrics: {
        soundCorrelation: 0.84,
        acousticSignatureId: "signature-self",
        heardAcousticSignatureId: "signature-peer"
      }
    }
  });

  assert.equal(telemetry.payload.metrics.acousticSignatureId, "signature-self");
  assert.equal(telemetry.payload.metrics.heardAcousticSignatureId, "signature-peer");
  assert.equal(telemetry.payload.metrics.soundCorrelation, 0.84);
});

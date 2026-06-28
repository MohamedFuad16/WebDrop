import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonMessage, ProtocolError, validateRoutedMessage } from "../src/message-schema.js";

test("parseJsonMessage enforces the JSON byte cap and rejects non-JSON frames", () => {
  const maxBytes = 256;
  const fits = JSON.stringify({ type: "client:ping", payload: { pad: "x".repeat(64) } });
  assert.ok(Buffer.byteLength(fits, "utf8") <= maxBytes);
  assert.deepEqual(parseJsonMessage(fits, maxBytes).type, "client:ping");

  const oversized = JSON.stringify({ type: "client:ping", payload: { pad: "x".repeat(maxBytes) } });
  assert.throws(() => parseJsonMessage(oversized, maxBytes), (error) => {
    assert.ok(error instanceof ProtocolError);
    assert.equal(error.code, "message_too_large");
    return true;
  });

  assert.throws(() => parseJsonMessage(Buffer.from("{}"), maxBytes), (error) => {
    assert.equal(error.code, "binary_not_allowed");
    return true;
  });
  assert.throws(() => parseJsonMessage("not json", maxBytes), (error) => {
    assert.equal(error.code, "invalid_json");
    return true;
  });
  assert.throws(() => parseJsonMessage("[]", maxBytes), (error) => {
    assert.equal(error.code, "invalid_message");
    return true;
  });
  assert.throws(() => parseJsonMessage(JSON.stringify({ payload: {} }), maxBytes), (error) => {
    assert.equal(error.code, "missing_type");
    return true;
  });
});

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
        heardAcousticSignatureId: "signature-peer",
        acousticRecordingDurationMs: 3600,
        acousticRecordingRms: 0.012,
        acousticRecordingPeak: 0.08,
        acousticDetectionMethod: "energy-assisted",
        acousticDetections: [{
          signatureId: "signature-peer",
          correlation: 0.21,
          marginDb: 4.8,
          detectionMethod: "energy-assisted",
          energyAssisted: true
        }]
      }
    }
  });

  assert.equal(telemetry.payload.metrics.acousticSignatureId, "signature-self");
  assert.equal(telemetry.payload.metrics.heardAcousticSignatureId, "signature-peer");
  assert.equal(telemetry.payload.metrics.soundCorrelation, 0.84);
  assert.equal(telemetry.payload.metrics.acousticRecordingDurationMs, 3600);
  assert.equal(telemetry.payload.metrics.acousticRecordingRms, 0.012);
  assert.equal(telemetry.payload.metrics.acousticRecordingPeak, 0.08);
  assert.equal(telemetry.payload.metrics.acousticDetectionMethod, "energy-assisted");
  assert.deepEqual(telemetry.payload.metrics.acousticDetections, [{
    signatureId: "signature-peer",
    correlation: 0.21,
    marginDb: 4.8,
    detectionMethod: "energy-assisted",
    energyAssisted: true,
    sampleOffset: null,
    slotEnergy: false,
    packetCount: 0,
    packetAverageCorrelation: 0,
    packetSpacingMs: 0
  }]);
});

test("admin acoustic monitor payloads are bounded for live diagnostics", () => {
  const start = validateRoutedMessage({
    type: "admin:monitor:start",
    targetId: "phone-a",
    payload: {
      monitorId: "monitor-a",
      intervalMs: 120,
      startFrequencyHz: 17000,
      endFrequencyHz: 22000,
      emit: true
    }
  });
  assert.equal(start.payload.monitorId, "monitor-a");
  assert.equal(start.payload.intervalMs, 500);
  assert.equal(start.payload.startFrequencyHz, 18500);
  assert.equal(start.payload.endFrequencyHz, 21000);
  assert.equal(start.payload.emit, true);

  const telemetry = validateRoutedMessage({
    type: "admin:monitor:telemetry",
    targetId: "admin-a",
    payload: {
      monitorId: "monitor-a",
      status: "active",
      sequence: 7,
      sampleRate: 48000,
      emitted: true,
      detected: true,
      startFrequencyHz: 18600,
      endFrequencyHz: 19400,
      peakDb: -42,
      noiseDb: -53.5,
      marginDb: 11.5,
      confidence: 2,
      bumpDetected: true,
      bumpPoints: 14,
      tiltDetected: true,
      tiltDegrees: 32.4,
      motionSamples: 84,
      maxAcceleration: 18.2,
      bands: [{
        startFrequencyHz: 18000,
        endFrequencyHz: 18500,
        detected: false,
        peakDb: -82,
        noiseDb: -91,
        marginDb: 9,
        confidence: 0.12
      }, {
        startFrequencyHz: 18500,
        endFrequencyHz: 19500,
        detected: true,
        peakDb: -42,
        noiseDb: -53.5,
        marginDb: 11.5,
        confidence: 0.42
      }]
    }
  });
  assert.equal(telemetry.payload.sequence, 7);
  assert.equal(telemetry.payload.peakDb, -42);
  assert.equal(telemetry.payload.noiseDb, -53.5);
  assert.equal(telemetry.payload.marginDb, 11.5);
  assert.equal(telemetry.payload.confidence, 1);
  assert.equal(telemetry.payload.bumpDetected, true);
  assert.equal(telemetry.payload.bumpPoints, 14);
  assert.equal(telemetry.payload.tiltDetected, true);
  assert.equal(telemetry.payload.tiltDegrees, 32.4);
  assert.equal(telemetry.payload.motionSamples, 84);
  assert.equal(telemetry.payload.maxAcceleration, 18.2);
  assert.equal(telemetry.payload.bands.length, 2);
  assert.deepEqual(telemetry.payload.bands[1], {
    startFrequencyHz: 18500,
    endFrequencyHz: 19500,
    detected: true,
    peakDb: -42,
    noiseDb: -53.5,
    marginDb: 11.5,
    confidence: 0.42
  });
});

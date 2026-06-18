import assert from "node:assert/strict";
import test from "node:test";

import { PROXIMITY_SCORE_MINIMUM, proximityScore } from "../js/services/proximity-engine.js";
import {
  AcousticProximitySensor,
  analyzeFrequencyBand,
  DEFAULT_CHIRP,
  findBestCorrelation
} from "../js/services/acoustic-proximity.js";
import { exceedsTiltThreshold, MotionProximitySensor } from "../js/services/motion-proximity.js";

test("physical proximity uses a minimum score of 55", () => {
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
  assert.equal(PROXIMITY_SCORE_MINIMUM, 55);
});

test("tilt must be strictly greater than 30 degrees", () => {
  assert.equal(exceedsTiltThreshold({ beta: 30, gamma: 0 }), false);
  assert.equal(exceedsTiltThreshold({ beta: -30, gamma: 0 }), false);
  assert.equal(exceedsTiltThreshold({ beta: 30.01, gamma: 0 }), true);
  assert.equal(exceedsTiltThreshold({ beta: 0, gamma: -30.01 }), true);
});

test("restored iPhone motion grants are revalidated through the native prompt", async () => {
  let permissionRequests = 0;
  const target = {
    DeviceMotionEvent: {
      async requestPermission() {
        permissionRequests += 1;
        return "granted";
      }
    }
  };
  const sensor = new MotionProximitySensor({ target });

  sensor.restorePermission("granted");
  const result = await sensor.requestPermission();

  assert.equal(result.granted, true);
  assert.equal(permissionRequests, 1);
});

test("microphone permission requests raw audio suitable for iPhone ultrasound", async () => {
  let requestedConstraints;
  const sensor = new AcousticProximitySensor({
    mediaDevices: {
      async getUserMedia(constraints) {
        requestedConstraints = constraints;
        return { active: true };
      }
    }
  });

  const result = await sensor.requestMicrophonePermission();

  assert.equal(result.granted, true);
  assert.deepEqual(requestedConstraints, {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  });
});

test("microphone stream stays warm when acoustic capture stops without release", async () => {
  let getUserMediaCalls = 0;
  let stoppedTracks = 0;
  const stream = {
    active: true,
    getTracks() {
      return [{ stop() { stoppedTracks += 1; } }];
    }
  };
  const sensor = new AcousticProximitySensor({
    mediaDevices: {
      async getUserMedia() {
        getUserMediaCalls += 1;
        return stream;
      }
    }
  });

  const first = await sensor.requestMicrophonePermission();
  sensor.stopCapture({ releaseStream: false });
  const second = await sensor.requestMicrophonePermission();
  sensor.stopCapture({ releaseStream: true });

  assert.equal(first.granted, true);
  assert.equal(second.granted, true);
  assert.equal(second.cached, true);
  assert.equal(getUserMediaCalls, 1);
  assert.equal(stoppedTracks, 1);
});

test("iPhone audio output is unlocked before the delayed ceremony", async () => {
  let resumeCalls = 0;
  let oscillatorStarts = 0;
  const context = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    async resume() {
      resumeCalls += 1;
      this.state = "running";
    },
    createOscillator() {
      return {
        connect() {},
        disconnect() {},
        start() { oscillatorStarts += 1; },
        stop() {},
        addEventListener(_type, callback) { callback(); }
      };
    },
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
  };
  const sensor = new AcousticProximitySensor({ audioContextFactory: () => context });

  const result = await sensor.prepareAudioOutput();

  assert.equal(result.granted, true);
  assert.equal(resumeCalls, 1);
  assert.equal(oscillatorStarts, 1);
});

test("near-ultrasound band detection tolerates phone speaker distortion", () => {
  const sampleRate = 48_000;
  const fftSize = 8192;
  const frequencies = new Float32Array(fftSize / 2).fill(-92);
  const hzPerBin = sampleRate / fftSize;
  for (let frequency = DEFAULT_CHIRP.startFrequencyHz; frequency <= DEFAULT_CHIRP.endFrequencyHz; frequency += hzPerBin) {
    frequencies[Math.round(frequency / hzPerBin)] = -46;
  }

  const evidence = analyzeFrequencyBand(frequencies, { sampleRate, fftSize });

  assert.equal(DEFAULT_CHIRP.startFrequencyHz, 15_800);
  assert.equal(DEFAULT_CHIRP.endFrequencyHz, 18_000);
  assert.equal(evidence.detected, true);
  assert.ok(evidence.marginDb > 30);
  assert.ok(evidence.confidence > 0.5);
});

test("chirp correlation accepts inverted microphone polarity", () => {
  const template = Float32Array.from([1, -0.5, 0.25, -1]);
  const samples = Float32Array.from([-1, 0.5, -0.25, 1]);
  const result = findBestCorrelation(samples, template);
  assert.equal(result.correlation, 1);
  assert.equal(result.offset, 0);
});

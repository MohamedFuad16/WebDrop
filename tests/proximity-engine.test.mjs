import assert from "node:assert/strict";
import test from "node:test";

import { ProximityEngine, PROXIMITY_SCORE_MINIMUM, proximityScore } from "../js/services/proximity-engine.js";
import {
  AcousticProximitySensor,
  analyzeFrequencyBand,
  createChirpSamples,
  DEFAULT_CHIRP,
  findBestCorrelation,
  MIN_INAUDIBLE_FREQUENCY_HZ,
  supportsInaudibleChirp
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

test("inaudible ultrasound band detection tolerates phone speaker distortion", () => {
  const sampleRate = 48_000;
  const fftSize = 8192;
  const frequencies = new Float32Array(fftSize / 2).fill(-92);
  const hzPerBin = sampleRate / fftSize;
  for (let frequency = DEFAULT_CHIRP.startFrequencyHz; frequency <= DEFAULT_CHIRP.endFrequencyHz; frequency += hzPerBin) {
    frequencies[Math.round(frequency / hzPerBin)] = -46;
  }

  const evidence = analyzeFrequencyBand(frequencies, { sampleRate, fftSize });

  assert.equal(DEFAULT_CHIRP.startFrequencyHz, 20_050);
  assert.equal(DEFAULT_CHIRP.endFrequencyHz, 20_950);
  assert.ok(DEFAULT_CHIRP.startFrequencyHz >= MIN_INAUDIBLE_FREQUENCY_HZ);
  assert.equal(evidence.detected, true);
  assert.ok(evidence.marginDb > 30);
  assert.ok(evidence.confidence > 0.5);
});

test("diagnostics sample the live ultrasonic band without releasing the warm microphone", async () => {
  const sampleRate = 48_000;
  const stream = {
    active: true,
    getAudioTracks() {
      return [{}];
    }
  };
  const analyser = {
    fftSize: 4096,
    smoothingTimeConstant: 0,
    get frequencyBinCount() {
      return this.fftSize / 2;
    },
    getFloatFrequencyData(values) {
      values.fill(-94);
      const hzPerBin = sampleRate / this.fftSize;
      for (let frequency = DEFAULT_CHIRP.startFrequencyHz; frequency <= DEFAULT_CHIRP.endFrequencyHz; frequency += hzPerBin) {
        values[Math.round(frequency / hzPerBin)] = -48;
      }
    },
    disconnect() {}
  };
  const context = {
    state: "running",
    sampleRate,
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    },
    createAnalyser() {
      return analyser;
    }
  };
  const sensor = new AcousticProximitySensor({
    audioContextFactory: () => context,
    mediaDevices: {
      async getUserMedia() {
        return stream;
      }
    }
  });

  await sensor.requestMicrophonePermission();
  const sample = await sensor.sampleFrequencyBand(DEFAULT_CHIRP);

  assert.equal(sample.available, true);
  assert.equal(sample.detected, true);
  assert.equal(sample.sampleRate, sampleRate);
  assert.ok(sample.marginDb > 30);
  assert.deepEqual(sensor.getStatus(), {
    streamActive: true,
    contextState: "running",
    sampleRate,
    inputTracks: 1
  });
});

test("chirp emission refuses sample rates that would fold into audible frequencies", () => {
  assert.equal(supportsInaudibleChirp(48_000), true);
  assert.equal(supportsInaudibleChirp(44_100), false);
  assert.equal(createChirpSamples(44_100).every((sample) => sample === 0), true);
});

test("chirp correlation accepts inverted microphone polarity", () => {
  const template = Float32Array.from([1, -0.5, 0.25, -1]);
  const samples = Float32Array.from([-1, 0.5, -0.25, 1]);
  const result = findBestCorrelation(samples, template);
  assert.equal(result.correlation, 1);
  assert.equal(result.offset, 0);
});

test("coded inaudible chirps remain distinguishable inside one shared band", () => {
  const codeOne = createChirpSamples(48_000, { ...DEFAULT_CHIRP, code: 1 });
  const codeFive = createChirpSamples(48_000, { ...DEFAULT_CHIRP, code: 5 });
  const same = findBestCorrelation(codeOne, codeOne, { step: 1 });
  const different = findBestCorrelation(codeOne, codeFive, { step: 1 });

  assert.equal(same.correlation, 1);
  assert.ok(different.correlation < 0.8);
});

test("anonymous ceremony records continuously and decodes after every transmit slot", async () => {
  const calls = [];
  const acoustic = {
    async startCeremonyCapture() {
      calls.push("capture:start");
      return { started: true, sampleRate: 48_000 };
    },
    async emitChirp(options) {
      calls.push(`emit:${options.code}`);
      return { emitted: true, sampleRate: 48_000 };
    },
    stopCeremonyCapture() {
      calls.push("capture:stop");
      return { samples: new Float32Array(48), sampleRate: 48_000, durationMs: 1 };
    },
    decodeCeremonyCapture(_recording, plan) {
      calls.push("capture:decode");
      return plan.slice(1).map((signature, index) => ({
        signatureId: signature.id,
        slot: index + 2,
        slotCount: plan.length,
        startFrequencyHz: signature.startFrequencyHz,
        endFrequencyHz: signature.endFrequencyHz,
        detected: true,
        correlation: index ? 0.52 : 0.91,
        marginDb: index ? 8 : 24,
        sampleOffset: 100 + index
      }));
    },
    close() {}
  };
  const motion = {
    getSnapshot() { return { bump: true, tilted: true, samples: 4 }; },
    stopCapture() {}
  };
  const engine = new ProximityEngine({ enabled: true, acoustic, motion });
  const plan = Array.from({ length: 5 }, (_, index) => ({
    id: `signature-${index}`,
    startFrequencyHz: 20_050,
    endFrequencyHz: 20_950,
    code: index
  }));

  const result = await engine.runRealCeremony({
    acousticPlan: plan,
    acousticSignatureId: plan[0].id,
    acousticOptions: { intervalMs: 1000 },
    startAt: Date.now(),
    ceremonyDurationMs: 80
  });

  assert.deepEqual(calls, ["capture:start", "emit:0", "capture:stop", "capture:decode"]);
  assert.equal(result.metrics.heardAcousticSignatureId, "signature-1");
  assert.equal(result.metrics.acousticDetections.length, 4);
  assert.equal(result.metrics.acousticConfidenceMargin, 0.39);
});

test("two devices emit and receive chirps in separate synchronized slots", async () => {
  const medium = createVirtualAcousticMedium();
  const motion = {
    getSnapshot() {
      return { bump: true, tilted: true, samples: 4 };
    },
    stopCapture() {}
  };
  const emitEngine = new ProximityEngine({
    enabled: true,
    acoustic: medium.createSensor("emit-device"),
    motion
  });
  const detectEngine = new ProximityEngine({
    enabled: true,
    acoustic: medium.createSensor("detect-device"),
    motion
  });
  const startAt = Date.now() + 25;

  const [emitResult, detectResult] = await Promise.all([
    emitEngine.runRealCeremony({
      acousticRole: "emit",
      acousticOptions: { intervalMs: 180 },
      startAt,
      ceremonyDurationMs: 1600
    }),
    detectEngine.runRealCeremony({
      acousticRole: "detect",
      acousticOptions: { intervalMs: 180 },
      startAt,
      ceremonyDurationMs: 1600
    })
  ]);

  assert.equal(emitResult.evidence.acoustic.emitted, true);
  assert.equal(emitResult.evidence.acoustic.detected, true);
  assert.equal(detectResult.evidence.acoustic.emitted, true);
  assert.equal(detectResult.evidence.acoustic.detected, true);
  assert.ok(medium.detections.has("emit-device<-detect-device"));
  assert.ok(medium.detections.has("detect-device<-emit-device"));
});

test("anonymous acoustic plans emit the assigned signature and report the strongest peer signature", async () => {
  const emittedBands = [];
  const detectedBands = [];
  const progressEvents = [];
  const acoustic = {
    async emitChirp(options) {
      emittedBands.push([options.startFrequencyHz, options.endFrequencyHz]);
      return { emitted: true };
    },
    async detectChirp(options) {
      detectedBands.push([options.startFrequencyHz, options.endFrequencyHz]);
      return {
        detected: true,
        correlation: 0.84,
        band: { marginDb: 31 }
      };
    }
  };
  const motion = {
    getSnapshot() {
      return { bump: true, tilted: true, samples: 4 };
    },
    stopCapture() {}
  };
  const engine = new ProximityEngine({ enabled: true, acoustic, motion });
  const plan = [
    { id: "self-signature", startFrequencyHz: 20050, endFrequencyHz: 20280 },
    { id: "peer-signature", startFrequencyHz: 20350, endFrequencyHz: 20580 }
  ];

  const result = await engine.runRealCeremony({
    acousticPlan: plan,
    acousticSignatureId: "self-signature",
    acousticOptions: { intervalMs: 500 },
    startAt: Date.now() + 5,
    ceremonyDurationMs: 840,
    onProgress(event) {
      progressEvents.push(event);
    }
  });

  assert.deepEqual(emittedBands, [[20050, 20280]]);
  assert.deepEqual(detectedBands, [[20350, 20580]]);
  assert.deepEqual(
    progressEvents
      .filter((event) => event.phase === "audio" && event.state === "active" && event.acoustic?.mode)
      .map((event) => ({
        mode: event.acoustic?.mode,
        slot: event.acoustic?.slot,
        slotCount: event.acoustic?.slotCount,
        startFrequencyHz: event.acoustic?.startFrequencyHz,
        endFrequencyHz: event.acoustic?.endFrequencyHz,
        marginDb: event.acoustic?.marginDb
      })),
    [
      {
        mode: "emit",
        slot: 1,
        slotCount: 2,
        startFrequencyHz: 20050,
        endFrequencyHz: 20280,
        marginDb: undefined
      },
      {
        mode: "emitted",
        slot: 1,
        slotCount: 2,
        startFrequencyHz: 20050,
        endFrequencyHz: 20280,
        marginDb: undefined
      },
      {
        mode: "listen",
        slot: 2,
        slotCount: 2,
        startFrequencyHz: 20350,
        endFrequencyHz: 20580,
        marginDb: undefined
      },
      {
        mode: "detected",
        slot: 2,
        slotCount: 2,
        startFrequencyHz: 20350,
        endFrequencyHz: 20580,
        marginDb: 31
      }
    ]
  );
  assert.equal(result.metrics.acousticSignatureId, "self-signature");
  assert.equal(result.metrics.heardAcousticSignatureId, "peer-signature");
  assert.equal(result.evidence.acoustic.detected, true);
  assert.equal(result.evidence.acoustic.mode, "detected");
  assert.equal(result.evidence.acoustic.slot, 2);
  assert.equal(result.evidence.acoustic.slotCount, 2);
  assert.equal(result.evidence.acoustic.marginDb, 31);
  assert.equal(result.evidence.acoustic.startFrequencyHz, 20350);
  assert.equal(result.evidence.acoustic.endFrequencyHz, 20580);
});

test("anonymous acoustic plans keep a final missed-slot summary for failed physical tests", async () => {
  const acoustic = {
    async emitChirp() {
      return { emitted: true };
    },
    async detectChirp() {
      return {
        detected: false,
        correlation: 0.12,
        reason: "timeout"
      };
    }
  };
  const motion = {
    getSnapshot() {
      return { bump: true, tilted: true, samples: 4 };
    },
    stopCapture() {}
  };
  const engine = new ProximityEngine({ enabled: true, acoustic, motion });
  const plan = [
    { id: "self-signature", startFrequencyHz: 20050, endFrequencyHz: 20280 },
    { id: "peer-one", startFrequencyHz: 20350, endFrequencyHz: 20580 },
    { id: "peer-two", startFrequencyHz: 20650, endFrequencyHz: 20880 }
  ];

  const result = await engine.runRealCeremony({
    acousticPlan: plan,
    acousticSignatureId: "self-signature",
    acousticOptions: { intervalMs: 500 },
    startAt: Date.now() + 5,
    ceremonyDurationMs: 1260
  });

  assert.equal(result.evidence.acoustic.detected, false);
  assert.equal(result.evidence.acoustic.mode, "missed");
  assert.equal(result.evidence.acoustic.missedCount, 2);
  assert.equal(result.evidence.acoustic.slotCount, 3);
  assert.equal(result.evidence.acoustic.startFrequencyHz, 20350);
  assert.equal(result.evidence.acoustic.endFrequencyHz, 20880);
});

test("anonymous acoustic plans keep listening briefly for a late peer signature", async () => {
  const detectCalls = [];
  const acoustic = {
    async emitChirp() {
      return { emitted: true };
    },
    async detectChirp(options) {
      detectCalls.push(options);
      const graceAttempt = detectCalls.length > 1;
      return graceAttempt
        ? {
          detected: true,
          correlation: 0.84,
          band: { marginDb: 24 }
        }
        : {
          detected: false,
          correlation: 0.1,
          reason: "timeout"
        };
    }
  };
  const motion = {
    getSnapshot() {
      return { bump: true, tilted: true, samples: 4 };
    },
    stopCapture() {}
  };
  const engine = new ProximityEngine({ enabled: true, acoustic, motion });

  const result = await engine.runRealCeremony({
    acousticPlan: [
      { id: "self-signature", startFrequencyHz: 20050, endFrequencyHz: 20280 },
      { id: "late-peer", startFrequencyHz: 20350, endFrequencyHz: 20580 }
    ],
    acousticSignatureId: "self-signature",
    acousticOptions: { intervalMs: 500 },
    startAt: Date.now() + 5,
    ceremonyDurationMs: 1040
  });

  assert.equal(detectCalls.length, 2);
  assert.equal(result.evidence.acoustic.detected, true);
  assert.equal(result.evidence.acoustic.mode, "detected");
  assert.equal(result.evidence.acoustic.targetSignatureId, "late-peer");
  assert.equal(result.evidence.acoustic.marginDb, 24);
  assert.equal(result.metrics.heardAcousticSignatureId, "late-peer");
});

function createVirtualAcousticMedium() {
  const pulses = new Map();
  const detections = new Set();
  const peerFor = (deviceId) => deviceId === "emit-device" ? "detect-device" : "emit-device";
  return {
    detections,
    createSensor(deviceId) {
      return {
        async emitChirp() {
          pulses.set(deviceId, Date.now());
          await sleep(20);
          return { emitted: true, durationMs: 20, sampleRate: 48_000 };
        },
        async detectChirp({ timeoutMs = 700 } = {}) {
          const peerId = peerFor(deviceId);
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            const pulseAgeMs = Date.now() - (pulses.get(peerId) || 0);
            if (pulseAgeMs >= 0 && pulseAgeMs <= 70) {
              detections.add(`${deviceId}<-${peerId}`);
              return { detected: true, correlation: 0.92, threshold: 0.38 };
            }
            await sleep(5);
          }
          return { detected: false, correlation: 0, threshold: 0.38, reason: "timeout" };
        }
      };
    }
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

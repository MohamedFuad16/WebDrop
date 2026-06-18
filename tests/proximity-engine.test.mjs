import assert from "node:assert/strict";
import test from "node:test";

import { PROXIMITY_SCORE_MINIMUM, proximityScore } from "../js/services/proximity-engine.js";
import { AcousticProximitySensor } from "../js/services/acoustic-proximity.js";
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

export class MotionProximitySensor {
  constructor({
    target = globalThis,
    bumpThreshold = 14,
    tiltThreshold = 25,
    now = () => Date.now()
  } = {}) {
    this.target = target;
    this.bumpThreshold = bumpThreshold;
    this.tiltThreshold = tiltThreshold;
    this.now = now;
    this.permission = "unknown";
    this.listening = false;
    this.snapshot = emptySnapshot();
    this.boundMotionHandler = (event) => this.#handleMotion(event);
  }

  async requestPermission() {
    if (this.permission === "granted") {
      return { granted: true, reason: "granted", cached: true };
    }
    if (["denied", "unsupported"].includes(this.permission)) {
      return { granted: false, reason: this.permission, cached: true };
    }
    const DeviceMotionEvent = this.target.DeviceMotionEvent;
    if (!DeviceMotionEvent) {
      this.permission = "unsupported";
      return { granted: false, reason: "unsupported" };
    }

    try {
      const result = typeof DeviceMotionEvent.requestPermission === "function"
        ? await DeviceMotionEvent.requestPermission()
        : "granted";
      this.permission = result;
      return { granted: result === "granted", reason: result };
    } catch (error) {
      this.permission = "error";
      return { granted: false, reason: "error", error };
    }
  }

  restorePermission(permission) {
    if (["granted", "denied", "unsupported"].includes(permission)) {
      this.permission = permission;
    }
    return this.permission;
  }

  startCapture() {
    if (!this.target.DeviceMotionEvent) return { started: false, reason: "unsupported" };
    if (typeof this.target.addEventListener !== "function") {
      return { started: false, reason: "event-target-unavailable" };
    }
    if (this.permission !== "granted") {
      return { started: false, reason: "permission-not-granted" };
    }
    if (!this.listening) {
      this.target.addEventListener("devicemotion", this.boundMotionHandler);
      this.listening = true;
    }
    return { started: true };
  }

  stopCapture() {
    if (this.listening && typeof this.target.removeEventListener === "function") {
      this.target.removeEventListener("devicemotion", this.boundMotionHandler);
    }
    this.listening = false;
  }

  reset() {
    this.snapshot = emptySnapshot();
  }

  getSnapshot() {
    return {
      ...this.snapshot,
      tilt: { ...this.snapshot.tilt }
    };
  }

  #handleMotion(event) {
    const tilt = tiltFromAcceleration(event.accelerationIncludingGravity);
    const acceleration = vectorMagnitude(event.acceleration);
    const bump = acceleration >= this.bumpThreshold;
    const tilted = Math.abs(tilt.beta) >= this.tiltThreshold
      || Math.abs(tilt.gamma) >= this.tiltThreshold;

    this.snapshot = {
      samples: this.snapshot.samples + 1,
      lastSampleAt: this.now(),
      acceleration,
      maxAcceleration: Math.max(this.snapshot.maxAcceleration, acceleration),
      bump: this.snapshot.bump || bump,
      bumpAt: bump ? this.now() : this.snapshot.bumpAt,
      tilt,
      tilted: this.snapshot.tilted || tilted
    };
  }
}

export function vectorMagnitude(vector = {}) {
  const x = finite(vector?.x);
  const y = finite(vector?.y);
  const z = finite(vector?.z);
  return Math.sqrt(x * x + y * y + z * z);
}

export function tiltFromAcceleration(acceleration = {}) {
  const x = finite(acceleration?.x);
  const y = finite(acceleration?.y);
  const z = finite(acceleration?.z);
  const beta = Math.atan2(y, Math.sqrt(x * x + z * z)) * 180 / Math.PI;
  const gamma = Math.atan2(x, Math.sqrt(y * y + z * z)) * 180 / Math.PI;
  return { beta, gamma };
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function emptySnapshot() {
  return {
    samples: 0,
    lastSampleAt: null,
    acceleration: 0,
    maxAcceleration: 0,
    bump: false,
    bumpAt: null,
    tilt: { beta: 0, gamma: 0 },
    tilted: false
  };
}

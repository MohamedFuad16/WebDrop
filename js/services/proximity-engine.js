import { AcousticProximitySensor } from "./acoustic-proximity.js?v=1.0.40";
import { MotionProximitySensor } from "./motion-proximity.js?v=1.0.40";
import { createQrToken, validateQrToken } from "./proximity-token.js?v=1.0.40";

export class ProximityEngine {
  constructor({
    enabled = false,
    acoustic = new AcousticProximitySensor(),
    motion = new MotionProximitySensor()
  } = {}) {
    this.enabled = enabled;
    this.acoustic = acoustic;
    this.motion = motion;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    return this.enabled;
  }

  async requestMicrophonePermission(constraints) {
    return this.acoustic.requestMicrophonePermission(constraints);
  }

  async requestMotionPermission() {
    return this.motion.requestPermission();
  }

  restoreMotionPermission(permission) {
    return this.motion.restorePermission?.(permission);
  }

  startMotionCapture() {
    return this.motion.startCapture();
  }

  resetMotionCapture() {
    this.motion.reset();
  }

  stopMotionCapture() {
    this.motion.stopCapture();
  }

  stopAcousticCapture() {
    this.acoustic.stop();
  }

  async emitAcousticChirp(options) {
    return this.acoustic.emitChirp(options);
  }

  async detectAcousticChirp(options) {
    return this.acoustic.detectChirp(options);
  }

  createQrToken(options) {
    return createQrToken(options);
  }

  validateQrToken(token, options) {
    return validateQrToken(token, options);
  }

  getSnapshot() {
    return {
      enabled: this.enabled,
      motion: this.motion.getSnapshot()
    };
  }

  async runRealCeremony({
    acoustic = true,
    acousticRole = "detect",
    acousticOptions,
    startAt = Date.now(),
    ceremonyDurationMs = 3000,
    tokenFresh = false,
    qrToken,
    qrOptions,
    onProgress = () => {}
  } = {}) {
    if (!this.enabled) {
      return disabledResult();
    }

    await waitUntil(startAt);
    onProgress({ phase: "audio", state: acoustic ? "active" : "unavailable" });
    const acousticResult = acoustic
      ? await exchangeChirps(this.acoustic, {
        role: acousticRole,
        options: acousticOptions,
        durationMs: ceremonyDurationMs
      })
      : { detected: false, reason: "skipped" };
    const motion = this.motion.getSnapshot();
    onProgress({ phase: "audio", state: acousticResult.detected ? "complete" : "failed", acoustic: acousticResult });
    onProgress({ phase: "motion", state: "complete", motion });
    const qr = qrToken
      ? validateQrToken(qrToken, qrOptions)
      : { valid: false, reason: "not-provided" };
    const metrics = {
      tokenFresh: tokenFresh || qr.valid,
      acoustic: acousticResult.detected,
      soundCorrelation: acousticResult.detected ? 1 : 0,
      acousticCorrelation: acousticResult.correlation || 0,
      motionCorrelation: motion.bump && motion.tilted ? 1 : motion.samples > 0 ? 0.4 : 0,
      tilt: motion.tilted,
      bump: motion.bump,
      qrFallback: qr.valid && !acousticResult.detected,
      lowRttHint: false
    };
    const score = proximityScore(metrics);
    const passed = score > 90;
    onProgress({ phase: "score", state: passed ? "complete" : "failed", score, metrics, motion });

    return {
      passed,
      score,
      metrics,
      evidence: { acoustic: { ...acousticResult, role: acousticRole }, motion, qr }
    };
  }

  async runCeremony({ capabilities }) {
    await delay(850);
    const metrics = {
      tokenFresh: true,
      acoustic: Boolean(capabilities.microphone),
      tilt: Boolean(capabilities.motion),
      bump: Boolean(capabilities.bump),
      qrFallback: !capabilities.microphone || !capabilities.motion,
      lowRttHint: true
    };
    const score = proximityScore(metrics);
    return {
      passed: score > 90,
      score,
      metrics
    };
  }

  async close() {
    this.motion.stopCapture();
    await this.acoustic.close();
  }
}

async function exchangeChirps(acoustic, { role, options = {}, durationMs = 3000 }) {
  const phaseDurationMs = Math.max(700, Math.floor((durationMs - 200) / 2));
  const startedAt = Date.now();
  let emitted;
  let detected;
  if (role === "emit") {
    emitted = await emitChirpSequence(acoustic, options, phaseDurationMs);
    detected = await acoustic.detectChirp({ timeoutMs: phaseDurationMs, ...options });
  } else {
    detected = await acoustic.detectChirp({ timeoutMs: phaseDurationMs, ...options });
    emitted = await emitChirpSequence(acoustic, options, phaseDurationMs);
  }
  return {
    emitted: Boolean(emitted?.emitted),
    emittedCount: emitted?.emittedCount || 0,
    detected: Boolean(detected?.detected),
    correlation: detected?.correlation || 0,
    threshold: detected?.threshold,
    elapsedMs: Date.now() - startedAt
  };
}

async function emitChirpSequence(acoustic, options = {}, durationMs = 1400) {
  const intervalMs = Math.max(180, options.intervalMs || 420);
  const startedAt = Date.now();
  let emittedCount = 0;
  let latest = { emitted: false, reason: "not-started" };
  while (Date.now() - startedAt < durationMs - intervalMs) {
    latest = await acoustic.emitChirp(options);
    if (!latest.emitted) break;
    emittedCount += 1;
    await delay(intervalMs);
  }
  return {
    ...latest,
    emitted: emittedCount > 0,
    emittedCount,
    elapsedMs: Date.now() - startedAt
  };
}

function waitUntil(timestamp) {
  return delay(Math.max(0, Number(timestamp) - Date.now()));
}

export function proximityScore(metrics) {
  const sound = metricValue(metrics.soundCorrelation ?? metrics.acoustic);
  const motion = metricValue(metrics.motionCorrelation);
  const bump = metricValue(metrics.bump);
  const tilt = metricValue(metrics.tilt);
  const qr = metricValue(metrics.qrMatch ?? metrics.qrFallback);
  return Math.round((sound * 34 + motion * 26 + bump * 20 + tilt * 12 + qr * 8) * 10) / 10;
}

function metricValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function disabledResult() {
  const metrics = {
    tokenFresh: false,
    acoustic: false,
    tilt: false,
    bump: false,
    qrFallback: false,
    lowRttHint: false
  };
  return {
    passed: false,
    score: 0,
    metrics,
    evidence: {},
    reason: "disabled"
  };
}

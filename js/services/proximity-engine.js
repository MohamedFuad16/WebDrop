import { AcousticProximitySensor } from "./acoustic-proximity.js";
import { MotionProximitySensor } from "./motion-proximity.js";
import { createQrToken, validateQrToken } from "./proximity-token.js";

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
    qrOptions
  } = {}) {
    if (!this.enabled) {
      return disabledResult();
    }

    await waitUntil(startAt);
    const acousticResult = acoustic
      ? await exchangeChirps(this.acoustic, {
        role: acousticRole,
        options: acousticOptions,
        durationMs: ceremonyDurationMs
      })
      : { detected: false, reason: "skipped" };
    const motion = this.motion.getSnapshot();
    const qr = qrToken
      ? validateQrToken(qrToken, qrOptions)
      : { valid: false, reason: "not-provided" };
    const metrics = {
      tokenFresh: tokenFresh || qr.valid,
      acoustic: acousticResult.detected,
      soundCorrelation: acousticResult.correlation || 0,
      motionCorrelation: motion.bump && motion.tilted ? 1 : motion.samples > 0 ? 0.4 : 0,
      tilt: motion.tilted,
      bump: motion.bump,
      qrFallback: qr.valid && !acousticResult.detected,
      lowRttHint: false
    };
    const score = proximityScore(metrics);

    return {
      passed: score >= 58,
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
      passed: score >= 58,
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
  let score = 0;
  if (metrics.tokenFresh) score += 24;
  if (metrics.acoustic) score += 30;
  if (metrics.tilt) score += 12;
  if (metrics.bump) score += 14;
  if (metrics.lowRttHint) score += 6;
  if (metrics.qrFallback) score += 30;
  return score;
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

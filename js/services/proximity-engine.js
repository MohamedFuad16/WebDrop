import { AcousticProximitySensor } from "./acoustic-proximity.js?v=1.0.69";
import { MotionProximitySensor } from "./motion-proximity.js?v=1.0.69";
import { createQrToken, validateQrToken } from "./proximity-token.js?v=1.0.69";

export const PROXIMITY_SCORE_MINIMUM = 55;
const ACOUSTIC_SLOT_GUARD_MS = 80;
const ACOUSTIC_MIN_SLOT_MS = 520;
const ACOUSTIC_GRACE_LISTEN_MS = 1600;

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

  async prepareAudioOutput() {
    return this.acoustic.prepareAudioOutput();
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

  stopAcousticCapture(options) {
    this.acoustic.stopCapture?.(options) || this.acoustic.stop();
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

  getAcousticStatus() {
    return this.acoustic.getStatus?.() || {
      streamActive: false,
      contextState: "unsupported",
      sampleRate: null,
      inputTracks: 0
    };
  }

  async runRealCeremony({
    acoustic = true,
    acousticRole = "detect",
    acousticPlan = null,
    acousticSignatureId = null,
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
      ? acousticPlan?.length && acousticSignatureId
        ? await exchangeSignatureChirps(this.acoustic, {
          plan: acousticPlan,
          ownSignatureId: acousticSignatureId,
          options: acousticOptions,
          startAt,
          durationMs: ceremonyDurationMs,
          onProgress
        })
        : await exchangeChirps(this.acoustic, {
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
      acousticSignatureId: acousticResult.ownSignatureId || null,
      heardAcousticSignatureId: acousticResult.heardSignatureId || null,
      acousticEmitted: Boolean(acousticResult.emitted),
      acousticDetected: Boolean(acousticResult.detected),
      acousticMode: acousticResult.mode || null,
      acousticSlot: acousticResult.slot || 0,
      acousticSlotCount: acousticResult.slotCount || 0,
      acousticStartFrequencyHz: acousticResult.startFrequencyHz || null,
      acousticEndFrequencyHz: acousticResult.endFrequencyHz || null,
      acousticMarginDb: acousticResult.marginDb || 0,
      acousticDetectionMethod: acousticResult.detectionMethod || null,
      acousticSampleRate: acousticResult.sampleRate || null,
      acousticRecordingDurationMs: acousticResult.recordingDurationMs || 0,
      acousticRecordingRms: acousticResult.recordingRms || 0,
      acousticRecordingPeak: acousticResult.recordingPeak || 0,
      acousticReason: acousticResult.reason || null,
      acousticConfidenceMargin: acousticResult.confidenceMargin || 0,
      acousticRunnerUpCorrelation: acousticResult.runnerUpCorrelation || 0,
      acousticDetections: (acousticResult.detections || []).map((detection) => ({
        signatureId: detection.signatureId,
        correlation: detection.correlation || 0,
        marginDb: detection.marginDb || 0,
        detectionMethod: detection.detectionMethod || null,
        energyAssisted: Boolean(detection.energyAssisted),
        sampleOffset: detection.sampleOffset ?? null
      })),
      motionCorrelation: motion.bump && motion.tilted ? 1 : motion.samples > 0 ? 0.4 : 0,
      tilt: motion.tilted,
      bump: motion.bump,
      qrFallback: qr.valid && !acousticResult.detected,
      lowRttHint: false
    };
    const score = proximityScore(metrics);
    const passed = score >= PROXIMITY_SCORE_MINIMUM;
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
      passed: score >= PROXIMITY_SCORE_MINIMUM,
      score,
      metrics
    };
  }

  async close() {
    this.motion.stopCapture();
    await this.acoustic.close();
  }
}

async function exchangeSignatureChirps(acoustic, {
  plan,
  ownSignatureId,
  options = {},
  startAt,
  durationMs = 3600,
  onProgress = () => {}
}) {
  const signatures = normalizeAcousticPlan(plan);
  const slotDurationMs = Math.max(ACOUSTIC_MIN_SLOT_MS, Math.floor(durationMs / Math.max(1, signatures.length)));
  if (typeof acoustic.startCeremonyCapture === "function" && typeof acoustic.decodeCeremonyCapture === "function") {
    return exchangeCapturedSignatureChirps(acoustic, {
      signatures, ownSignatureId, options, startAt, durationMs, slotDurationMs, onProgress
    });
  }
  const detections = [];
  const listenedSlots = [];
  let emittedCount = 0;

  for (let index = 0; index < signatures.length; index += 1) {
    const signature = signatures[index];
    await waitUntil(Number(startAt) + index * slotDurationMs);
    const signatureOptions = {
      ...options,
      startFrequencyHz: signature.startFrequencyHz,
      endFrequencyHz: signature.endFrequencyHz
    };
    if (signature.id === ownSignatureId) {
      onProgress({
        phase: "audio",
        state: "active",
        acoustic: {
          mode: "emit",
          slot: index + 1,
          slotCount: signatures.length,
          ownSignatureId,
          startFrequencyHz: signature.startFrequencyHz,
          endFrequencyHz: signature.endFrequencyHz
        }
      });
      const emitted = await emitChirpSequence(acoustic, signatureOptions, slotDurationMs - ACOUSTIC_SLOT_GUARD_MS);
      emittedCount += emitted.emittedCount || 0;
      onProgress({
        phase: "audio",
        state: "active",
        acoustic: {
          mode: emitted.emitted ? "emitted" : "emit-failed",
          slot: index + 1,
          slotCount: signatures.length,
          ownSignatureId,
          emittedCount: emitted.emittedCount || 0,
          reason: emitted.reason || null,
          sampleRate: emitted.sampleRate || null,
          startFrequencyHz: signature.startFrequencyHz,
          endFrequencyHz: signature.endFrequencyHz
        }
      });
      continue;
    }
    onProgress({
      phase: "audio",
      state: "active",
      acoustic: {
        mode: "listen",
        slot: index + 1,
        slotCount: signatures.length,
        targetSignatureId: signature.id,
        startFrequencyHz: signature.startFrequencyHz,
        endFrequencyHz: signature.endFrequencyHz
      }
    });
    const detected = await acoustic.detectChirp({
      ...signatureOptions,
      timeoutMs: slotDurationMs - ACOUSTIC_SLOT_GUARD_MS
    });
    const slotResult = {
      signatureId: signature.id,
      slot: index + 1,
      slotCount: signatures.length,
      startFrequencyHz: signature.startFrequencyHz,
      endFrequencyHz: signature.endFrequencyHz,
      detected: Boolean(detected.detected),
      correlation: detected.correlation || 0,
      marginDb: detected.band?.marginDb || 0,
      detectionMethod: detected.detectionMethod || null,
      energyAssisted: Boolean(detected.energyAssisted)
    };
    listenedSlots.push(slotResult);
    if (detected.detected) {
      detections.push(slotResult);
    }
    onProgress({
      phase: "audio",
      state: "active",
      acoustic: {
        mode: detected.detected ? "detected" : "missed",
        slot: index + 1,
        slotCount: signatures.length,
        targetSignatureId: signature.id,
        detected: Boolean(detected.detected),
        correlation: detected.correlation || 0,
        marginDb: detected.band?.marginDb || 0,
        detectionMethod: detected.detectionMethod || null,
        energyAssisted: Boolean(detected.energyAssisted),
        reason: detected.reason || null,
        startFrequencyHz: signature.startFrequencyHz,
        endFrequencyHz: signature.endFrequencyHz
      }
    });
  }

  if (!detections.length && emittedCount > 0 && listenedSlots.length) {
    await listenForLatePeerSignatures(acoustic, {
      options,
      slots: listenedSlots,
      detections,
      onProgress
    });
  }

  detections.sort((a, b) => b.marginDb - a.marginDb || b.correlation - a.correlation);
  const strongest = detections[0] || null;
  const summary = strongest
    ? {
      mode: "detected",
      slot: strongest.slot,
      slotCount: strongest.slotCount,
      marginDb: strongest.marginDb,
      correlation: strongest.correlation,
      detectionMethod: strongest.detectionMethod || null,
      energyAssisted: Boolean(strongest.energyAssisted),
      targetSignatureId: strongest.signatureId,
      startFrequencyHz: strongest.startFrequencyHz,
      endFrequencyHz: strongest.endFrequencyHz
    }
    : acousticMissSummary(listenedSlots, signatures.length);
  return {
    emitted: emittedCount > 0,
    emittedCount,
    detected: Boolean(strongest),
    correlation: strongest?.correlation || 0,
    ownSignatureId,
    heardSignatureId: strongest?.signatureId || null,
    detections,
    ...summary
  };
}

async function exchangeCapturedSignatureChirps(acoustic, {
  signatures, ownSignatureId, options, startAt, durationMs, slotDurationMs, onProgress
}) {
  const capture = await acoustic.startCeremonyCapture({ maximumDurationMs: durationMs + 600 });
  if (!capture?.started) {
    return { detected: false, emitted: false, mode: "missed", reason: capture?.reason || "capture-failed" };
  }
  let emittedCount = 0;
  for (let index = 0; index < signatures.length; index += 1) {
    const signature = signatures[index];
    await waitUntil(Number(startAt) + index * slotDurationMs);
    const ownSlot = signature.id === ownSignatureId;
    onProgress({
      phase: "audio",
      state: "active",
      acoustic: {
        mode: ownSlot ? "emit" : "listen",
        continuous: true,
        slot: index + 1,
        slotCount: signatures.length,
        targetSignatureId: ownSlot ? null : signature.id,
        ownSignatureId,
        code: signature.code,
        startFrequencyHz: signature.startFrequencyHz,
        endFrequencyHz: signature.endFrequencyHz
      }
    });
    if (ownSlot) {
      const emitted = await emitChirpSequence(acoustic, { ...options, ...signature }, slotDurationMs - ACOUSTIC_SLOT_GUARD_MS);
      emittedCount += emitted.emittedCount || 0;
    }
  }
  await waitUntil(Number(startAt) + durationMs);
  const recording = acoustic.stopCeremonyCapture();
  const detections = acoustic.decodeCeremonyCapture(recording, signatures, {
    ownSignatureId,
    slotDurationMs,
    slotGuardMs: ACOUSTIC_SLOT_GUARD_MS
  });
  for (const detection of detections) {
    onProgress({
      phase: "audio",
      state: "active",
      acoustic: {
        mode: detection.detected ? "detected" : "missed",
        continuous: true,
        ...detection,
        targetSignatureId: detection.signatureId
      }
    });
  }
  const heard = detections
    .filter((detection) => detection.detected)
    .sort((a, b) => b.correlation - a.correlation || b.marginDb - a.marginDb);
  const strongest = heard[0] || null;
  const bestAttempt = [...detections]
    .sort((a, b) => b.correlation - a.correlation || b.marginDb - a.marginDb)[0] || null;
  const runnerUp = heard[1] || null;
  const confidenceMargin = strongest
    ? Math.max(0, strongest.correlation - (runnerUp?.correlation || 0))
    : 0;
  return {
    emitted: emittedCount > 0,
    emittedCount,
    detected: Boolean(strongest),
    correlation: strongest?.correlation || bestAttempt?.correlation || 0,
    marginDb: strongest?.marginDb || bestAttempt?.marginDb || 0,
    confidenceMargin,
    runnerUpCorrelation: runnerUp?.correlation || 0,
    ownSignatureId,
    heardSignatureId: strongest?.signatureId || null,
    detections,
    sampleRate: recording.sampleRate,
    recordingDurationMs: recording.durationMs,
    recordingRms: recording.rms || 0,
    recordingPeak: recording.peak || 0,
    ...(strongest ? {
      mode: "detected",
      slot: strongest.slot,
      slotCount: strongest.slotCount,
      marginDb: strongest.marginDb,
      detectionMethod: strongest.detectionMethod || null,
      energyAssisted: Boolean(strongest.energyAssisted),
      targetSignatureId: strongest.signatureId,
      startFrequencyHz: strongest.startFrequencyHz,
      endFrequencyHz: strongest.endFrequencyHz
    } : acousticMissSummary(detections, signatures.length))
  };
}

function acousticMissSummary(listenedSlots, slotCount) {
  const slots = listenedSlots.filter(Boolean);
  if (!slots.length) return { mode: "missed", slotCount };
  return {
    mode: "missed",
    missedCount: slots.length,
    slotCount,
    startFrequencyHz: Math.min(...slots.map((slot) => slot.startFrequencyHz)),
    endFrequencyHz: Math.max(...slots.map((slot) => slot.endFrequencyHz))
  };
}

async function listenForLatePeerSignatures(acoustic, {
  options = {},
  slots = [],
  detections,
  onProgress = () => {}
}) {
  const listenSlots = slots.filter(Boolean);
  if (!listenSlots.length) return;
  const timeoutMs = Math.max(360, Math.floor(ACOUSTIC_GRACE_LISTEN_MS / listenSlots.length));
  for (const slot of listenSlots) {
    onProgress({
      phase: "audio",
      state: "active",
      acoustic: {
        mode: "listen",
        slot: slot.slot,
        slotCount: slot.slotCount,
        targetSignatureId: slot.signatureId,
        startFrequencyHz: slot.startFrequencyHz,
        endFrequencyHz: slot.endFrequencyHz,
        grace: true
      }
    });
    const detected = await acoustic.detectChirp({
      ...options,
      startFrequencyHz: slot.startFrequencyHz,
      endFrequencyHz: slot.endFrequencyHz,
      timeoutMs
    });
    slot.detected = Boolean(detected.detected);
    slot.correlation = detected.correlation || 0;
    slot.marginDb = detected.band?.marginDb || 0;
    slot.grace = true;
    if (detected.detected) {
      detections.push(slot);
      onProgress({
        phase: "audio",
        state: "active",
        acoustic: {
          mode: "detected",
          slot: slot.slot,
          slotCount: slot.slotCount,
          targetSignatureId: slot.signatureId,
          detected: true,
          correlation: slot.correlation,
          marginDb: slot.marginDb,
          startFrequencyHz: slot.startFrequencyHz,
          endFrequencyHz: slot.endFrequencyHz,
          grace: true
        }
      });
      return;
    }
  }
}

function normalizeAcousticPlan(plan) {
  return (Array.isArray(plan) ? plan : []).map((entry) => ({
    id: String(entry?.id || "").slice(0, 80),
    startFrequencyHz: Number(entry?.startFrequencyHz),
    endFrequencyHz: Number(entry?.endFrequencyHz),
    code: Math.max(0, Math.floor(Number(entry?.code || 0)))
  })).filter((entry) => entry.id
    && Number.isFinite(entry.startFrequencyHz)
    && Number.isFinite(entry.endFrequencyHz)
    && entry.startFrequencyHz >= 18_500
    && entry.endFrequencyHz > entry.startFrequencyHz);
}

async function exchangeChirps(acoustic, { role, options = {}, durationMs = 3000 }) {
  const phaseDurationMs = Math.max(700, Math.floor((durationMs - 200) / 2));
  const startedAt = Date.now();
  const secondPhaseAt = startedAt + phaseDurationMs;
  let emitted;
  let detected;
  if (role === "emit") {
    emitted = await emitChirpSequence(acoustic, options, phaseDurationMs);
    await waitUntil(secondPhaseAt);
    detected = await acoustic.detectChirp({ timeoutMs: phaseDurationMs, ...options });
  } else {
    detected = await acoustic.detectChirp({ timeoutMs: phaseDurationMs, ...options });
    // Detection may resolve on the first pulse. Keep the receiver in its
    // assigned slot so its reply does not overlap the other device's output.
    await waitUntil(secondPhaseAt);
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
  while (Date.now() - startedAt < durationMs) {
    latest = await acoustic.emitChirp(options);
    if (!latest.emitted) break;
    emittedCount += 1;
    const remainingMs = durationMs - (Date.now() - startedAt);
    if (remainingMs < intervalMs) break;
    await delay(Math.min(intervalMs, remainingMs));
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

export const DEFAULT_CHIRP = Object.freeze({
  durationMs: 96,
  startFrequencyHz: 18600,
  endFrequencyHz: 19400,
  code: 0,
  gain: 0.12
});

export const MIN_INAUDIBLE_FREQUENCY_HZ = 18500;
export const ENERGY_ASSISTED_CORRELATION_MINIMUM = 0.16;
export const ENERGY_ASSISTED_MARGIN_DB_MINIMUM = 4.5;
export const SLOT_CORRELATION_MINIMUM = 0.2;

export class AcousticProximitySensor {
  constructor({
    audioContextFactory = defaultAudioContextFactory,
    mediaDevices = globalThis.navigator?.mediaDevices
  } = {}) {
    this.audioContextFactory = audioContextFactory;
    this.mediaDevices = mediaDevices;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.captureNode = null;
    this.captureSink = null;
    this.captureChunks = [];
    this.captureSampleCount = 0;
    this.captureMaximumSamples = 0;
  }

  async requestMicrophonePermission(constraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  }) {
    if (this.stream?.active) {
      return { granted: true, reason: "granted", stream: this.stream, cached: true };
    }
    const mediaDevices = this.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      return { granted: false, reason: "unsupported" };
    }

    try {
      this.stream = await mediaDevices.getUserMedia(constraints);
      return { granted: true, stream: this.stream };
    } catch (error) {
      return { granted: false, reason: permissionReason(error), error };
    }
  }

  async prepareAudioOutput() {
    try {
      const context = this.#ensureContext();
      const resume = context.state !== "running" ? context.resume() : Promise.resolve();
      if (context.createOscillator && context.createGain) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = 0.00001;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime || 0);
        oscillator.stop((context.currentTime || 0) + 0.02);
        oscillator.addEventListener?.("ended", () => {
          oscillator.disconnect();
          gain.disconnect();
        }, { once: true });
      }
      await resume;
      return { granted: context.state === "running", reason: context.state };
    } catch (error) {
      return { granted: false, reason: "audio-context-error", error };
    }
  }

  async emitChirp(options = {}) {
    const contextResult = await this.#getContextResult();
    if (!contextResult.context) {
      return { emitted: false, reason: contextResult.reason, error: contextResult.error };
    }
    const context = contextResult.context;
    const chirp = { ...DEFAULT_CHIRP, ...options };
    if (!supportsInaudibleChirp(context.sampleRate, chirp)) {
      return {
        emitted: false,
        reason: "inaudible-frequency-unsupported",
        sampleRate: context.sampleRate
      };
    }
    const samples = createChirpSamples(context.sampleRate, chirp);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = chirp.gain;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();

    await ended(source, samples.length / context.sampleRate);
    source.disconnect();
    gain.disconnect();

    return {
      emitted: true,
      durationMs: chirp.durationMs,
      gain: chirp.gain,
      sampleRate: context.sampleRate,
      startFrequencyHz: chirp.startFrequencyHz,
      endFrequencyHz: chirp.endFrequencyHz
    };
  }

  async detectChirp({
    timeoutMs = 2500,
    threshold = 0.38,
    pollIntervalMs = 28,
    requiredBandHits = 2,
    ...chirpOptions
  } = {}) {
    if (!this.stream?.active) {
      return { detected: false, reason: "microphone-not-granted", correlation: 0 };
    }

    const contextResult = await this.#getContextResult();
    if (!contextResult.context) {
      return {
        detected: false,
        correlation: 0,
        reason: contextResult.reason,
        error: contextResult.error
      };
    }
    const context = contextResult.context;
    const chirp = { ...DEFAULT_CHIRP, ...chirpOptions };
    if (!supportsInaudibleChirp(context.sampleRate, chirp)) {
      return {
        detected: false,
        correlation: 0,
        reason: "inaudible-frequency-unsupported",
        sampleRate: context.sampleRate
      };
    }
    this.#ensureAnalyser(context);
    const template = createChirpSamples(context.sampleRate, {
      ...chirp
    });
    this.analyser.fftSize = nextPowerOfTwo(Math.max(template.length * 2, 4096), 16384);
    const samples = new Float32Array(this.analyser.fftSize);
    const frequencies = new Float32Array(this.analyser.frequencyBinCount);
    const deadline = performanceNow() + timeoutMs;
    let best = { correlation: 0, offset: -1, band: null };
    let bandHits = 0;

    while (performanceNow() < deadline) {
      this.analyser.getFloatFrequencyData(frequencies);
      const band = analyzeFrequencyBand(frequencies, {
        sampleRate: context.sampleRate,
        fftSize: this.analyser.fftSize,
        startFrequencyHz: chirpOptions.startFrequencyHz || DEFAULT_CHIRP.startFrequencyHz,
        endFrequencyHz: chirpOptions.endFrequencyHz || DEFAULT_CHIRP.endFrequencyHz
      });
      bandHits = band.detected ? bandHits + 1 : Math.max(0, bandHits - 1);
      let candidate = { correlation: 0, offset: -1 };
      if (band.detected) {
        this.analyser.getFloatTimeDomainData(samples);
        candidate = findBestCorrelation(samples, template, { step: 8 });
      }
      const confidence = Math.max(candidate.correlation, band.confidence);
      if (confidence > best.correlation) best = { ...candidate, correlation: confidence, band };
      if (candidate.correlation >= threshold || bandHits >= requiredBandHits) {
        return { detected: true, ...best, threshold };
      }
      await wait(pollIntervalMs);
    }

    return { detected: false, ...best, threshold, reason: "timeout" };
  }

  async sampleFrequencyBand(options = {}) {
    if (!this.stream?.active) {
      return { available: false, reason: "microphone-not-granted" };
    }
    const contextResult = await this.#getContextResult();
    if (!contextResult.context) {
      return {
        available: false,
        reason: contextResult.reason,
        error: contextResult.error
      };
    }
    const context = contextResult.context;
    this.#ensureAnalyser(context);
    this.analyser.fftSize = 4096;
    const frequencies = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(frequencies);
    return {
      available: true,
      sampleRate: context.sampleRate,
      contextState: context.state,
      ...analyzeFrequencyBand(frequencies, {
        sampleRate: context.sampleRate,
        fftSize: this.analyser.fftSize,
        ...options
      })
    };
  }

  async startCeremonyCapture({ maximumDurationMs = 6000, bufferSize = 2048 } = {}) {
    if (!this.stream?.active) return { started: false, reason: "microphone-not-granted" };
    const contextResult = await this.#getContextResult();
    if (!contextResult.context) return { started: false, reason: contextResult.reason };
    const context = contextResult.context;
    if (typeof context.createScriptProcessor !== "function") {
      return { started: false, reason: "continuous-capture-unsupported" };
    }
    this.stopCeremonyCapture();
    this.#ensureAnalyser(context);
    this.captureChunks = [];
    this.captureSampleCount = 0;
    this.captureMaximumSamples = Math.ceil(context.sampleRate * maximumDurationMs / 1000);
    this.captureNode = context.createScriptProcessor(bufferSize, 1, 1);
    this.captureSink = context.createGain();
    this.captureSink.gain.value = 0;
    this.captureNode.onaudioprocess = (event) => {
      const input = event.inputBuffer?.getChannelData?.(0);
      if (!input?.length || this.captureSampleCount >= this.captureMaximumSamples) return;
      const remaining = this.captureMaximumSamples - this.captureSampleCount;
      const chunk = Float32Array.from(input.subarray(0, remaining));
      this.captureChunks.push(chunk);
      this.captureSampleCount += chunk.length;
    };
    this.source.connect(this.captureNode);
    this.captureNode.connect(this.captureSink);
    this.captureSink.connect(context.destination);
    return { started: true, sampleRate: context.sampleRate };
  }

  stopCeremonyCapture() {
    this.captureNode?.disconnect();
    this.captureSink?.disconnect();
    if (this.captureNode) this.captureNode.onaudioprocess = null;
    this.captureNode = null;
    this.captureSink = null;
    const samples = concatenateSamples(this.captureChunks, this.captureSampleCount);
    const sampleRate = this.context?.sampleRate || null;
    this.captureChunks = [];
    this.captureSampleCount = 0;
    this.captureMaximumSamples = 0;
    const signal = sampleEnergy(samples);
    return {
      samples,
      sampleRate,
      durationMs: sampleRate ? samples.length / sampleRate * 1000 : 0,
      rms: signal.rms,
      peak: signal.peak
    };
  }

  decodeCeremonyCapture(recording, plan, {
    ownSignatureId,
    slotDurationMs,
    threshold = 0.3,
    slotGuardMs = 260,
    driftGuardMs = 760,
    minimumMarginDb = 1.5,
    energyAssistedCorrelation = ENERGY_ASSISTED_CORRELATION_MINIMUM,
    energyAssistedMarginDb = ENERGY_ASSISTED_MARGIN_DB_MINIMUM,
    slotCorrelationMinimum = SLOT_CORRELATION_MINIMUM
  } = {}) {
    const sampleRate = Number(recording?.sampleRate);
    const samples = recording?.samples;
    if (!samples?.length || !Number.isFinite(sampleRate)) return [];
    return plan
      .map((signature, index) => {
        if (signature.id === ownSignatureId) return null;
        const template = createChirpSamples(sampleRate, signature);
        const guardSamples = Math.round(sampleRate * slotGuardMs / 1000);
        const driftSamples = Math.round(sampleRate * driftGuardMs / 1000);
        const nominalStart = Math.round(sampleRate * index * slotDurationMs / 1000);
        const nominalEnd = Math.round(sampleRate * (index + 1) * slotDurationMs / 1000);
        const slotStart = Math.max(0, nominalStart - guardSamples);
        const slotEnd = Math.min(samples.length, nominalEnd + guardSamples);
        const primary = scoreCaptureWindow(samples, template, slotStart, slotEnd, { step: 4 });
        const expandedStart = Math.max(0, nominalStart - driftSamples);
        const expandedEnd = Math.min(samples.length, nominalEnd + driftSamples);
        const expanded = scoreCaptureWindow(samples, template, expandedStart, expandedEnd, { step: 10 });
        const scored = chooseBestCaptureScore(primary, expanded);
        const correlationDetected = scored.correlation >= threshold && scored.marginDb >= minimumMarginDb;
        const energyAssisted = !correlationDetected
          && scored.correlation >= energyAssistedCorrelation
          && scored.marginDb >= energyAssistedMarginDb;
        const slottedCorrelation = !correlationDetected
          && !energyAssisted
          && scored.correlation >= slotCorrelationMinimum;
        return {
          signatureId: signature.id,
          slot: index + 1,
          slotCount: plan.length,
          code: Number(signature.code || 0),
          startFrequencyHz: signature.startFrequencyHz,
          endFrequencyHz: signature.endFrequencyHz,
          detected: correlationDetected || energyAssisted || slottedCorrelation,
          detectionMethod: correlationDetected
            ? "correlation"
            : energyAssisted
              ? "energy-assisted"
              : slottedCorrelation
                ? "slot-correlation"
                : "missed",
          energyAssisted,
          correlation: roundMetric(scored.correlation),
          marginDb: roundMetric(scored.marginDb),
          sampleOffset: scored.offset < 0 ? null : scored.offset,
          window: scored.window
        };
      })
      .filter(Boolean);
  }

  getStatus() {
    return {
      streamActive: Boolean(this.stream?.active),
      contextState: this.context?.state || "uninitialized",
      sampleRate: this.context?.sampleRate || null,
      inputTracks: this.stream?.getAudioTracks?.().length || 0
    };
  }

  stopCapture({ releaseStream = false } = {}) {
    this.stopCeremonyCapture();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
    if (releaseStream) {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  stop() {
    this.stopCapture({ releaseStream: true });
  }

  async close() {
    this.stop();
    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }
    this.context = null;
  }

  async #getRunningContext() {
    const context = this.#ensureContext();
    if (context.state !== "running") await context.resume();
    return context;
  }

  #ensureContext() {
    if (!this.context || this.context.state === "closed") this.context = this.audioContextFactory();
    return this.context;
  }

  async #getContextResult() {
    try {
      return { context: await this.#getRunningContext() };
    } catch (error) {
      return {
        context: null,
        reason: error?.message === "Web Audio is not supported" ? "unsupported" : "audio-context-error",
        error
      };
    }
  }

  #ensureAnalyser(context) {
    if (this.source && this.analyser) return;
    this.source = context.createMediaStreamSource(this.stream);
    this.analyser = context.createAnalyser();
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
  }
}

export function createChirpSamples(sampleRate, {
  durationMs = DEFAULT_CHIRP.durationMs,
  startFrequencyHz = DEFAULT_CHIRP.startFrequencyHz,
  endFrequencyHz = DEFAULT_CHIRP.endFrequencyHz,
  code = DEFAULT_CHIRP.code
} = {}) {
  const length = Math.max(1, Math.round(sampleRate * durationMs / 1000));
  const samples = new Float32Array(length);
  if (
    startFrequencyHz >= MIN_INAUDIBLE_FREQUENCY_HZ
    && !supportsInaudibleChirp(sampleRate, { startFrequencyHz, endFrequencyHz })
  ) {
    return samples;
  }
  const durationSeconds = length / sampleRate;
  const maximumFrequencyHz = sampleRate * 0.45;
  const safeEndFrequencyHz = clamp(endFrequencyHz, 1, maximumFrequencyHz);
  const safeStartFrequencyHz = clamp(startFrequencyHz, 1, safeEndFrequencyHz);
  const sweepRate = (safeEndFrequencyHz - safeStartFrequencyHz) / durationSeconds;
  const codeCycles = Math.max(1, Math.min(8, Math.floor(Number(code) || 0) + 1));
  const wobbleHz = (safeEndFrequencyHz - safeStartFrequencyHz) * 0.08;

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const normalizedTime = time / durationSeconds;
    const codedPhase = wobbleHz * durationSeconds / (2 * Math.PI * codeCycles)
      * (1 - Math.cos(2 * Math.PI * codeCycles * normalizedTime));
    const phase = 2 * Math.PI * (safeStartFrequencyHz * time + sweepRate * time * time / 2 + codedPhase);
    const envelope = Math.sin(Math.PI * index / Math.max(1, length - 1)) ** 2;
    samples[index] = Math.sin(phase) * envelope;
  }
  return samples;
}

export function supportsInaudibleChirp(sampleRate, {
  startFrequencyHz = DEFAULT_CHIRP.startFrequencyHz,
  endFrequencyHz = DEFAULT_CHIRP.endFrequencyHz
} = {}) {
  const maximumFrequencyHz = Number(sampleRate) * 0.45;
  return Number.isFinite(maximumFrequencyHz)
    && startFrequencyHz >= MIN_INAUDIBLE_FREQUENCY_HZ
    && endFrequencyHz > startFrequencyHz
    && endFrequencyHz <= maximumFrequencyHz;
}

export function normalizedCorrelation(samples, template, offset = 0) {
  if (!template.length || offset < 0 || offset + template.length > samples.length) return 0;
  let dot = 0;
  let sampleEnergy = 0;
  let templateEnergy = 0;

  for (let index = 0; index < template.length; index += 1) {
    const sample = samples[offset + index];
    const expected = template[index];
    dot += sample * expected;
    sampleEnergy += sample * sample;
    templateEnergy += expected * expected;
  }

  const denominator = Math.sqrt(sampleEnergy * templateEnergy);
  return denominator ? dot / denominator : 0;
}

export function findBestCorrelation(samples, template, { step = 8 } = {}) {
  let bestCorrelation = 0;
  let bestOffset = -1;
  const stride = Math.max(1, Math.floor(step));

  for (let offset = 0; offset + template.length <= samples.length; offset += stride) {
    const correlation = Math.abs(normalizedCorrelation(samples, template, offset));
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestOffset >= 0 && stride > 1) {
    const start = Math.max(0, bestOffset - stride);
    const end = Math.min(samples.length - template.length, bestOffset + stride);
    for (let offset = start; offset <= end; offset += 1) {
      const correlation = Math.abs(normalizedCorrelation(samples, template, offset));
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }
  }
  return { correlation: bestCorrelation, offset: bestOffset };
}

export function analyzeFrequencyBand(frequencies, {
  sampleRate,
  fftSize,
  startFrequencyHz = DEFAULT_CHIRP.startFrequencyHz,
  endFrequencyHz = DEFAULT_CHIRP.endFrequencyHz
} = {}) {
  const hzPerBin = Number(sampleRate) / Number(fftSize);
  if (!frequencies?.length || !Number.isFinite(hzPerBin) || hzPerBin <= 0) {
    return { detected: false, peakDb: -Infinity, noiseDb: -Infinity, marginDb: 0, confidence: 0 };
  }
  const valuesBetween = (start, end) => {
    const first = Math.max(0, Math.floor(start / hzPerBin));
    const last = Math.min(frequencies.length - 1, Math.ceil(end / hzPerBin));
    const values = [];
    for (let index = first; index <= last; index += 1) {
      const value = frequencies[index];
      if (Number.isFinite(value)) values.push(value);
    }
    return values;
  };
  const band = valuesBetween(startFrequencyHz, endFrequencyHz);
  const guard = [
    ...valuesBetween(Math.max(200, startFrequencyHz - 2600), startFrequencyHz - 500),
    ...valuesBetween(endFrequencyHz + 500, Math.min(sampleRate / 2, endFrequencyHz + 2600))
  ];
  const peakDb = band.length ? Math.max(...band) : -Infinity;
  const noiseDb = guard.length ? median(guard) : -100;
  const marginDb = peakDb - noiseDb;
  const levelConfidence = clamp((peakDb + 72) / 24, 0, 1);
  const marginConfidence = clamp((marginDb - 3) / 12, 0, 1);
  const confidence = Math.round(levelConfidence * marginConfidence * 1000) / 1000;
  return {
    detected: peakDb >= -70 && marginDb >= 6,
    peakDb,
    noiseDb,
    marginDb,
    confidence
  };
}

function defaultAudioContextFactory() {
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) throw new Error("Web Audio is not supported");
  return new AudioContext();
}

function permissionReason(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return "denied";
  if (error?.name === "NotFoundError") return "unavailable";
  return "error";
}

function nextPowerOfTwo(value, maximum) {
  return Math.min(maximum, 2 ** Math.ceil(Math.log2(value)));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function median(values) {
  if (!values.length) return -100;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ended(source, fallbackSeconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, fallbackSeconds * 1000 + 50);
    source.addEventListener("ended", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function concatenateSamples(chunks, length) {
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function correlationMarginDb(samples, template, offset) {
  if (offset < 0) return 0;
  let signalEnergy = 0;
  for (let index = 0; index < template.length && offset + index < samples.length; index += 1) {
    signalEnergy += samples[offset + index] ** 2;
  }
  const signalRms = Math.sqrt(signalEnergy / Math.max(1, template.length));
  let totalEnergy = 0;
  for (const sample of samples) totalEnergy += sample ** 2;
  const noiseEnergy = Math.max(1e-12, totalEnergy - signalEnergy);
  const noiseSamples = Math.max(1, samples.length - template.length);
  const noiseRms = Math.sqrt(noiseEnergy / noiseSamples);
  return Math.max(0, 20 * Math.log10((signalRms + 1e-9) / (noiseRms + 1e-9)));
}

function scoreCaptureWindow(samples, template, start, end, { step = 8 } = {}) {
  const safeStart = Math.max(0, Math.min(samples.length, Math.floor(start)));
  const safeEnd = Math.max(safeStart, Math.min(samples.length, Math.ceil(end)));
  const window = samples.subarray(safeStart, safeEnd);
  const match = findBestCorrelation(window, template, { step });
  return {
    correlation: match.correlation,
    marginDb: correlationMarginDb(window, template, match.offset),
    offset: match.offset < 0 ? -1 : safeStart + match.offset,
    window: step <= 4 ? "slot" : "expanded"
  };
}

function chooseBestCaptureScore(primary, expanded) {
  if (primary.correlation >= expanded.correlation) return primary;
  return expanded;
}

function sampleEnergy(samples) {
  if (!samples?.length) return { rms: 0, peak: 0 };
  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    sumSquares += sample * sample;
    if (magnitude > peak) peak = magnitude;
  }
  return {
    rms: roundMetric(Math.sqrt(sumSquares / samples.length)),
    peak: roundMetric(peak)
  };
}

function roundMetric(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

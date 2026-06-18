export const DEFAULT_CHIRP = Object.freeze({
  durationMs: 72,
  startFrequencyHz: 15800,
  endFrequencyHz: 18000,
  gain: 0.18
});

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
      sampleRate: context.sampleRate
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
    this.#ensureAnalyser(context);
    const template = createChirpSamples(context.sampleRate, {
      ...DEFAULT_CHIRP,
      ...chirpOptions
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

  stopCapture({ releaseStream = false } = {}) {
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
  endFrequencyHz = DEFAULT_CHIRP.endFrequencyHz
} = {}) {
  const length = Math.max(1, Math.round(sampleRate * durationMs / 1000));
  const samples = new Float32Array(length);
  const durationSeconds = length / sampleRate;
  const maximumFrequencyHz = sampleRate * 0.45;
  const safeEndFrequencyHz = clamp(endFrequencyHz, 1, maximumFrequencyHz);
  const safeStartFrequencyHz = clamp(
    startFrequencyHz,
    1,
    Math.max(1, safeEndFrequencyHz * 0.88)
  );
  const sweepRate = (safeEndFrequencyHz - safeStartFrequencyHz) / durationSeconds;

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const phase = 2 * Math.PI * (safeStartFrequencyHz * time + sweepRate * time * time / 2);
    const envelope = Math.sin(Math.PI * index / Math.max(1, length - 1)) ** 2;
    samples[index] = Math.sin(phase) * envelope;
  }
  return samples;
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
    detected: peakDb >= -66 && marginDb >= 6,
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

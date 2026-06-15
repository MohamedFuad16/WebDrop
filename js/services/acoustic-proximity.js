export const DEFAULT_CHIRP = Object.freeze({
  durationMs: 48,
  startFrequencyHz: 17000,
  endFrequencyHz: 19500,
  gain: 0.12
});

export class AcousticProximitySensor {
  constructor({ audioContextFactory = defaultAudioContextFactory } = {}) {
    this.audioContextFactory = audioContextFactory;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
  }

  async requestMicrophonePermission(constraints = { audio: true }) {
    const mediaDevices = globalThis.navigator?.mediaDevices;
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
    threshold = 0.62,
    pollIntervalMs = 32,
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
    this.analyser.fftSize = nextPowerOfTwo(Math.max(template.length * 2, 2048), 32768);
    const samples = new Float32Array(this.analyser.fftSize);
    const deadline = performanceNow() + timeoutMs;
    let best = { correlation: 0, offset: -1 };

    while (performanceNow() < deadline) {
      this.analyser.getFloatTimeDomainData(samples);
      const candidate = findBestCorrelation(samples, template);
      if (candidate.correlation > best.correlation) best = candidate;
      if (best.correlation >= threshold) {
        return { detected: true, ...best, threshold };
      }
      await wait(pollIntervalMs);
    }

    return { detected: false, ...best, threshold, reason: "timeout" };
  }

  stop() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source = null;
    this.analyser = null;
    this.stream = null;
  }

  async close() {
    this.stop();
    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }
    this.context = null;
  }

  async #getRunningContext() {
    if (!this.context || this.context.state === "closed") {
      this.context = this.audioContextFactory();
    }
    if (this.context.state === "suspended") await this.context.resume();
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

export function findBestCorrelation(samples, template, { step = 1 } = {}) {
  let bestCorrelation = 0;
  let bestOffset = -1;
  const stride = Math.max(1, Math.floor(step));

  for (let offset = 0; offset + template.length <= samples.length; offset += stride) {
    const correlation = normalizedCorrelation(samples, template, offset);
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  return { correlation: bestCorrelation, offset: bestOffset };
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

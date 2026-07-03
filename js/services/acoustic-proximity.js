export const DEFAULT_CHIRP = Object.freeze({
  durationMs: 112,
  // Fallback band only (server assigns per-session signature bands). Expanded
  // downward with MIN_INAUDIBLE_FREQUENCY_HZ so phones — whose speakers roll off
  // hard above ~18.5kHz — actually radiate the chirp.
  startFrequencyHz: 17800,
  endFrequencyHz: 18600,
  code: 0,
  // Live telemetry showed the common failure is the *receiving* phone reporting
  // det=False — it never heard the partner's chirp — while emit/score/bump/tilt
  // were fine. Phone speakers roll off hard at 18–19 kHz, so a modest 0.45
  // digital level often didn't carry across the gap. 0.72 gives materially more
  // acoustic output (better SNR at the far phone → fewer det=False) while
  // staying below clipping (peak·gain < 1) and inaudible in the ultrasonic band.
  gain: 0.72
});

// Lowered from 18500 to admit the expanded 17.8-20.0kHz band. ~17.5kHz is beyond
// most adults' hearing; the trade-off (faint audibility to young ears) was
// accepted to gain much louder, more reliable phone-speaker output and 4 lanes
// for concurrent pair sessions.
export const MIN_INAUDIBLE_FREQUENCY_HZ = 17500;
export const ENERGY_ASSISTED_CORRELATION_MINIMUM = 0.16;
export const ENERGY_ASSISTED_MARGIN_DB_MINIMUM = 4.5;
export const SLOT_ENERGY_MARGIN_DB_MINIMUM = 8;
export const SLOT_CORRELATION_MINIMUM = 0.2;
export const PACKET_CONSENSUS_CORRELATION_MINIMUM = 0.05;
export const PACKET_CONSENSUS_AVERAGE_MINIMUM = 0.06;
export const PACKET_CONSENSUS_COUNT_MINIMUM = 3;
export const CAPTURE_PRIMARY_CORRELATION_STEP = 16;
export const CAPTURE_EXPANDED_CORRELATION_STEP = 32;

export class AcousticProximitySensor {
  constructor({
    audioContextFactory = defaultAudioContextFactory,
    mediaDevices = globalThis.navigator?.mediaDevices,
    permissions = globalThis.navigator?.permissions
  } = {}) {
    this.audioContextFactory = audioContextFactory;
    this.mediaDevices = mediaDevices;
    this.permissions = permissions;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.captureNode = null;
    this.captureSink = null;
    this.captureChunks = [];
    this.captureSampleCount = 0;
    this.captureMaximumSamples = 0;
    // Identity of the stream + context the capture graph (source/analyser) was
    // last wired from, so #ensureAnalyser rebuilds after either is replaced
    // instead of leaving a MediaStreamSource attached to a dead node.
    this.graphStream = null;
    this.graphContext = null;
    // Per-track lifecycle bookkeeping so an iOS-muted / ended stream is dropped
    // and re-acquired on the next gesture instead of silently recording silence.
    this.trackHandlers = [];
    this.muteSince = 0;
    this.contextStateHandler = null;
    // Field-debug health surface, mirrored into ceremony telemetry.
    this.health = {
      muteEvents: 0,
      endedEvents: 0,
      interruptedCount: 0,
      rebuilds: 0,
      lastSelfTest: null,
      trackMuted: false,
      trackReadyState: null,
      contextSampleRate: null,
      trackSampleRate: null
    };
  }

  getHealth() {
    const track = this.#audioTrack();
    return {
      ...this.health,
      trackMuted: track ? Boolean(track.muted) : this.health.trackMuted,
      trackReadyState: track?.readyState ?? this.health.trackReadyState,
      contextSampleRate: this.context?.sampleRate ?? this.health.contextSampleRate,
      trackSampleRate: this.#trackSampleRate() ?? this.health.trackSampleRate,
      streamActive: Boolean(this.stream?.active),
      healthy: this.#streamHealthy()
    };
  }

  #audioTrack() {
    return this.stream?.getAudioTracks?.()[0] || null;
  }

  #trackSampleRate() {
    const settings = this.#audioTrack()?.getSettings?.();
    const rate = Number(settings?.sampleRate);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  }

  // A stream that iOS has muted (screen lock, backgrounding, route change) stays
  // `active` but delivers pure silence, which is the top cause of the observed
  // detected=false / rms≈0.001 field failures. Treat only a live, unmuted track
  // as usable.
  #streamHealthy() {
    const stream = this.stream;
    if (!stream?.active) return false;
    if (typeof stream.getAudioTracks !== "function") return true;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return true;
    // A real MediaStreamTrack always reports readyState/muted; treat only an
    // explicit "ended"/muted===true as unhealthy so mock tracks (tests) and
    // browsers that omit the fields still count as usable.
    return tracks.every((track) => track.readyState !== "ended" && track.muted !== true);
  }

  #attachTrackListeners(stream) {
    this.#detachTrackListeners();
    const track = stream?.getAudioTracks?.()[0];
    if (!track?.addEventListener) return;
    const onMute = () => {
      this.health.muteEvents += 1;
      this.muteSince = Date.now();
    };
    const onUnmute = () => { this.muteSince = 0; };
    const onEnded = () => {
      this.health.endedEvents += 1;
      this.#dropStream();
    };
    track.addEventListener("mute", onMute);
    track.addEventListener("unmute", onUnmute);
    track.addEventListener("ended", onEnded);
    this.trackHandlers = [
      ["mute", onMute],
      ["unmute", onUnmute],
      ["ended", onEnded]
    ].map(([type, handler]) => ({ track, type, handler }));
  }

  #detachTrackListeners() {
    for (const { track, type, handler } of this.trackHandlers) {
      track.removeEventListener?.(type, handler);
    }
    this.trackHandlers = [];
  }

  // Fully release the current stream + capture graph so the next
  // requestMicrophonePermission re-acquires a fresh, live stream.
  #dropStream() {
    this.#detachTrackListeners();
    try {
      this.source?.disconnect();
    } catch { /* already disconnected */ }
    this.source = null;
    this.analyser = null;
    this.graphStream = null;
    this.muteSince = 0;
    this.stream?.getTracks?.().forEach((track) => {
      try { track.stop(); } catch { /* ignore */ }
    });
    this.stream = null;
  }

  async requestMicrophonePermission(constraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 }
    },
    video: false
  }) {
    // Reuse only a genuinely healthy stream. A cached-but-muted/ended stream
    // (iOS after lock/background) is dropped so we re-acquire a live one.
    if (this.#streamHealthy()) {
      return { granted: true, reason: "granted", stream: this.stream, cached: true };
    }
    if (this.stream) this.#dropStream();
    const mediaDevices = this.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      return { granted: false, reason: "unsupported" };
    }

    // Where the Permissions API is available (Android/desktop) a persisted grant
    // lets getUserMedia resolve without a fresh prompt, and a persisted denial is
    // surfaced without a doomed re-prompt. iOS Safari rejects the "microphone"
    // descriptor, so this stays best-effort and never blocks the gesture path.
    const permissionState = await queryMicrophonePermissionState(this.permissions);
    if (permissionState === "denied") {
      return { granted: false, reason: "denied", permissionState };
    }

    try {
      this.stream = await mediaDevices.getUserMedia(constraints);
      this.#attachTrackListeners(this.stream);
      this.muteSince = 0;
      return { granted: true, stream: this.stream, permissionState };
    } catch (error) {
      return { granted: false, reason: permissionReason(error), error };
    }
  }

  async prepareAudioOutput() {
    try {
      const context = this.#ensureContext();
      const resume = context.state !== "running" ? context.resume() : Promise.resolve();
      // Prime the iOS "play and record" audio session with a short, real (but
      // inaudible) tone. The previous 0.00001-gain / 20ms pulse sat below the
      // session-activation threshold, so the mic input was never actually routed
      // and the ceremony captured silence. 60ms at 18.5kHz / gain 0.15 forces the
      // session live while staying inaudible.
      if (context.createOscillator && context.createGain) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        if (oscillator.frequency) oscillator.frequency.value = 18500;
        gain.gain.value = 0.15;
        oscillator.connect(gain);
        gain.connect(context.destination);
        const startAt = context.currentTime || 0;
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.06);
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

  // Called on tab foreground / pageshow: recover a suspended/interrupted context
  // and drop a stream iOS muted while backgrounded so the next gesture re-acquires.
  async revalidateAudio() {
    try {
      if (this.context && this.context.state !== "closed" && this.context.state !== "running") {
        await this.context.resume().catch(() => {});
      }
      if (this.stream && !this.#streamHealthy()) this.#dropStream();
      return { ok: true, contextState: this.context?.state || null, healthy: this.#streamHealthy() };
    } catch (error) {
      return { ok: false, error };
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

  async sampleFrequencyBands({ bands = [], fftSize = 4096 } = {}) {
    if (!this.stream?.active) {
      return { available: false, reason: "microphone-not-granted", bands: [] };
    }
    const contextResult = await this.#getContextResult();
    if (!contextResult.context) {
      return {
        available: false,
        reason: contextResult.reason,
        error: contextResult.error,
        bands: []
      };
    }
    const context = contextResult.context;
    this.#ensureAnalyser(context);
    this.analyser.fftSize = fftSize;
    const frequencies = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(frequencies);
    return {
      available: true,
      sampleRate: context.sampleRate,
      contextState: context.state,
      bands: bands.map((band) => ({
        ...band,
        ...analyzeFrequencyBand(frequencies, {
          sampleRate: context.sampleRate,
          fftSize: this.analyser.fftSize,
          startFrequencyHz: band.startFrequencyHz,
          endFrequencyHz: band.endFrequencyHz
        })
      }))
    };
  }

  async startCeremonyCapture({ maximumDurationMs = 6000, bufferSize = 2048 } = {}) {
    if (!this.#streamHealthy()) return { started: false, reason: "microphone-not-granted" };
    await this.#reconcileContextSampleRate();
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

  // Non-destructive snapshot of the samples captured so far, so the ceremony can
  // attempt an early decode mid-window without stopping the live capture.
  peekCeremonyCapture() {
    const samples = concatenateSamples(this.captureChunks, this.captureSampleCount);
    const sampleRate = this.context?.sampleRate || null;
    const signal = sampleEnergy(samples);
    return {
      samples,
      sampleRate,
      durationMs: sampleRate ? samples.length / sampleRate * 1000 : 0,
      rms: signal.rms,
      peak: signal.peak
    };
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
    // Milliseconds the recording started BEFORE the ceremony startAt. The slot
    // windows below are measured from startAt, but capture begins immediately
    // (startCeremonyCapture is called before the waitUntil(startAt)), so the
    // recording's t=0 leads startAt by this much. Adding it aligns the search
    // windows with where the chirps actually landed in the buffer.
    slotOffsetMs = 0,
    threshold = 0.3,
    slotGuardMs = 260,
    driftGuardMs = 520,
    minimumMarginDb = 1.5,
    energyAssistedCorrelation = ENERGY_ASSISTED_CORRELATION_MINIMUM,
    energyAssistedMarginDb = ENERGY_ASSISTED_MARGIN_DB_MINIMUM,
    slotEnergyMarginDb = SLOT_ENERGY_MARGIN_DB_MINIMUM,
    slotCorrelationMinimum = SLOT_CORRELATION_MINIMUM,
    packetIntervalMs = 220,
    packetConsensusCorrelation = PACKET_CONSENSUS_CORRELATION_MINIMUM,
    packetConsensusAverage = PACKET_CONSENSUS_AVERAGE_MINIMUM,
    packetConsensusCount = PACKET_CONSENSUS_COUNT_MINIMUM
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
        const offsetSamples = Math.round(sampleRate * Math.max(0, slotOffsetMs) / 1000);
        const nominalStart = Math.round(sampleRate * index * slotDurationMs / 1000) + offsetSamples;
        const nominalEnd = Math.round(sampleRate * (index + 1) * slotDurationMs / 1000) + offsetSamples;
        const slotStart = Math.max(0, nominalStart - guardSamples);
        const slotEnd = Math.min(samples.length, nominalEnd + guardSamples);
        const primary = scoreCaptureWindow(samples, template, slotStart, slotEnd, {
          step: CAPTURE_PRIMARY_CORRELATION_STEP,
          label: "slot"
        });
        const expandedStart = Math.max(0, nominalStart - driftSamples);
        const expandedEnd = Math.min(samples.length, nominalEnd + driftSamples);
        const expanded = scoreCaptureWindow(samples, template, expandedStart, expandedEnd, {
          step: CAPTURE_EXPANDED_CORRELATION_STEP,
          label: "expanded"
        });
        const scored = chooseBestCaptureScore(primary, expanded);
        const packetConsensus = scoreRepeatedPacketTrain(samples, template, {
          sampleRate,
          windowStart: expandedStart,
          windowEnd: expandedEnd,
          seedOffset: scored.offset,
          packetSpacingMs: Number(signature.durationMs || DEFAULT_CHIRP.durationMs) + packetIntervalMs,
          minimumCorrelation: packetConsensusCorrelation,
          minimumAverage: packetConsensusAverage,
          minimumCount: packetConsensusCount
        });
        const correlationDetected = scored.correlation >= threshold && scored.marginDb >= minimumMarginDb;
        const energyAssisted = !correlationDetected
          && scored.correlation >= energyAssistedCorrelation
          && scored.marginDb >= energyAssistedMarginDb;
        const slottedCorrelation = !correlationDetected
          && !energyAssisted
          && scored.correlation >= slotCorrelationMinimum;
        const repeatedPacketConsensus = !correlationDetected
          && !energyAssisted
          && !slottedCorrelation
          && packetConsensus.detected;
        const slottedEnergy = !correlationDetected
          && !energyAssisted
          && !slottedCorrelation
          && !repeatedPacketConsensus
          && scored.marginDb >= slotEnergyMarginDb;
        return {
          signatureId: signature.id,
          slot: index + 1,
          slotCount: plan.length,
          code: Number(signature.code || 0),
          startFrequencyHz: signature.startFrequencyHz,
          endFrequencyHz: signature.endFrequencyHz,
          detected: correlationDetected || energyAssisted || slottedCorrelation || repeatedPacketConsensus || slottedEnergy,
          detectionMethod: correlationDetected
            ? "correlation"
            : energyAssisted
              ? "energy-assisted"
              : slottedCorrelation
                ? "slot-correlation"
                : repeatedPacketConsensus
                  ? "packet-consensus"
                : slottedEnergy
                  ? "slot-energy"
                  : "missed",
          energyAssisted,
          slotEnergy: slottedEnergy,
          packetCount: packetConsensus.count,
          packetAverageCorrelation: roundMetric(packetConsensus.averageCorrelation),
          packetSpacingMs: roundMetric(packetConsensus.packetSpacingMs),
          correlation: roundMetric(Math.max(scored.correlation, packetConsensus.averageCorrelation)),
          marginDb: roundMetric(scored.marginDb),
          sampleOffset: scored.offset < 0 ? null : scored.offset,
          window: scored.window
        };
      })
      .filter(Boolean);
  }

  getStatus() {
    const track = this.#audioTrack();
    return {
      streamActive: Boolean(this.stream?.active),
      streamHealthy: this.#streamHealthy(),
      trackMuted: track ? Boolean(track.muted) : null,
      trackReadyState: track?.readyState || null,
      trackSampleRate: this.#trackSampleRate(),
      contextState: this.context?.state || "uninitialized",
      sampleRate: this.context?.sampleRate || null,
      inputTracks: this.stream?.getAudioTracks?.().length || 0
    };
  }

  stopCapture({ releaseStream = false } = {}) {
    this.stopCeremonyCapture();
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
    } catch { /* already disconnected */ }
    this.source = null;
    this.analyser = null;
    this.graphStream = null;
    this.graphContext = null;
    if (releaseStream) this.#dropStream();
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
    this.#watchContextState(context);
    // iOS reports "interrupted" (call, Siri, route change) and "suspended"; both
    // must be resumed or capture stays silent.
    if (context.state !== "running") {
      if (context.state === "interrupted") this.health.interruptedCount += 1;
      await context.resume();
    }
    return context;
  }

  #ensureContext() {
    if (!this.context || this.context.state === "closed") {
      // Match the AudioContext sample rate to the live mic track's rate. On iOS a
      // 44.1kHz context wired to a 48kHz mic stream (or vice-versa) makes
      // createMediaStreamSource capture silence. Pinning the rate at creation
      // avoids the WebKit resampler failure.
      const trackRate = this.#trackSampleRate();
      this.context = this.audioContextFactory(trackRate ? { sampleRate: trackRate } : undefined);
      this.health.contextSampleRate = this.context?.sampleRate ?? null;
    }
    return this.context;
  }

  #watchContextState(context) {
    if (!context?.addEventListener || this.contextStateHandler?.context === context) return;
    const handler = () => {
      if (context.state === "interrupted" || context.state === "suspended") {
        this.health.interruptedCount += 1;
        context.resume?.().catch(() => {});
      }
    };
    context.addEventListener("statechange", handler);
    this.contextStateHandler = { context, handler };
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
    // Rebuild whenever the stream OR context instance changed since the graph was
    // wired — a stale MediaStreamSource points at a dead track and captures
    // silence. (The old `if (source && analyser) return` never rebuilt.)
    if (this.source && this.analyser && this.graphStream === this.stream && this.graphContext === context) {
      return;
    }
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
    } catch { /* already disconnected */ }
    if (this.source || this.analyser) this.health.rebuilds += 1;
    this.source = context.createMediaStreamSource(this.stream);
    this.analyser = context.createAnalyser();
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.graphStream = this.stream;
    this.graphContext = context;
  }

  // If an early context (created during the gesture, before getUserMedia
  // resolved) has a different sample rate than the live mic track, close it so
  // the next #ensureContext recreates it pinned to the track rate.
  async #reconcileContextSampleRate() {
    const trackRate = this.#trackSampleRate();
    if (!trackRate || !this.context || this.context.state === "closed") return;
    if (Math.abs(this.context.sampleRate - trackRate) < 1) return;
    try {
      this.contextStateHandler = null;
      await this.context.close();
    } catch { /* ignore */ }
    this.context = null;
    this.source = null;
    this.analyser = null;
    this.graphStream = null;
    this.graphContext = null;
  }

  // Verify the mic actually captures audio: emit one short probe of the phone's
  // OWN signature and confirm it shows up in the capture. Used during the sync
  // phase before the ceremony so a dead/muted mic can be rebuilt in time.
  async captureSelfTest({ signature = {}, gain = 0.6, durationMs = 150, settleMs = 90 } = {}) {
    const started = await this.startCeremonyCapture({ maximumDurationMs: durationMs + settleMs + 400, bufferSize: 2048 });
    if (!started.started) {
      this.health.lastSelfTest = "failed";
      return { ok: false, reason: started.reason, peak: 0, rms: 0 };
    }
    // try/finally guarantees the probe capture is always torn down — a throw from
    // emitChirp must never leak the live captureNode into the real ceremony that
    // runs immediately after.
    let recording;
    try {
      await this.emitChirp({ ...DEFAULT_CHIRP, ...signature, gain, durationMs });
      await new Promise((resolve) => setTimeout(resolve, settleMs));
    } finally {
      recording = this.stopCeremonyCapture();
    }
    const ok = Number(recording.peak) >= 0.02;
    this.health.lastSelfTest = ok ? "pass" : "silent";
    return { ok, peak: recording.peak, rms: recording.rms, sampleRate: recording.sampleRate, reason: ok ? null : "silent-capture" };
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

function defaultAudioContextFactory(options) {
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) throw new Error("Web Audio is not supported");
  // Pin the sample rate to the mic track's rate when known (iOS resampler bug).
  // If the exact rate is unsupported the constructor throws — fall back to the
  // browser default rather than failing audio entirely.
  if (options?.sampleRate) {
    try {
      return new AudioContext({ sampleRate: options.sampleRate });
    } catch { /* fall through to default rate */ }
  }
  return new AudioContext();
}

function permissionReason(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return "denied";
  if (error?.name === "NotFoundError") return "unavailable";
  return "error";
}

async function queryMicrophonePermissionState(permissions) {
  if (!permissions?.query) return null;
  try {
    const status = await permissions.query({ name: "microphone" });
    return status?.state || null;
  } catch {
    return null;
  }
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

function scoreCaptureWindow(samples, template, start, end, { step = 8, label = "window" } = {}) {
  const safeStart = Math.max(0, Math.min(samples.length, Math.floor(start)));
  const safeEnd = Math.max(safeStart, Math.min(samples.length, Math.ceil(end)));
  const window = samples.subarray(safeStart, safeEnd);
  const match = findBestCorrelation(window, template, { step });
  return {
    correlation: match.correlation,
    marginDb: correlationMarginDb(window, template, match.offset),
    offset: match.offset < 0 ? -1 : safeStart + match.offset,
    window: label
  };
}

function scoreRepeatedPacketTrain(samples, template, {
  sampleRate,
  windowStart,
  windowEnd,
  seedOffset,
  packetSpacingMs,
  minimumCorrelation,
  minimumAverage,
  minimumCount
}) {
  if (seedOffset < 0 || !template.length || !Number.isFinite(sampleRate)) {
    return { detected: false, count: 0, averageCorrelation: 0, packetSpacingMs };
  }
  const spacingSamples = Math.max(template.length, Math.round(sampleRate * packetSpacingMs / 1000));
  const searchRadius = Math.max(16, Math.round(sampleRate * 0.035));
  const correlations = [];
  const maximumPackets = 12;

  for (let packet = -maximumPackets; packet <= maximumPackets; packet += 1) {
    const expectedOffset = seedOffset + packet * spacingSamples;
    if (expectedOffset < windowStart || expectedOffset + template.length > windowEnd) continue;
    let best = 0;
    const first = Math.max(windowStart, expectedOffset - searchRadius);
    const last = Math.min(windowEnd - template.length, expectedOffset + searchRadius);
    for (let offset = first; offset <= last; offset += CAPTURE_PRIMARY_CORRELATION_STEP) {
      best = Math.max(best, Math.abs(normalizedCorrelation(samples, template, offset)));
    }
    if (best >= minimumCorrelation) correlations.push(best);
  }

  const count = correlations.length;
  const averageCorrelation = count
    ? correlations.reduce((sum, correlation) => sum + correlation, 0) / count
    : 0;
  return {
    detected: count >= minimumCount && averageCorrelation >= minimumAverage,
    count,
    averageCorrelation,
    packetSpacingMs
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

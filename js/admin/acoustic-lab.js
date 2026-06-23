import {
  AcousticProximitySensor,
  DEFAULT_CHIRP
} from "../services/acoustic-proximity.js?v=1.0.66";
import { formatFrequency, formatNumber } from "./shared.js?v=1.0.66";

export class AcousticLab {
  constructor(document) {
    this.document = document;
    this.sensor = new AcousticProximitySensor();
    this.monitorTimer = 0;
    this.history = [];
    this.nodes = {
      canvas: document.querySelector("[data-acoustic-canvas]"),
      status: document.querySelector("[data-acoustic-status]"),
      microphone: document.querySelector("[data-acoustic-mic]"),
      context: document.querySelector("[data-acoustic-context]"),
      rate: document.querySelector("[data-acoustic-rate]"),
      margin: document.querySelector("[data-acoustic-margin]"),
      output: document.querySelector("[data-acoustic-output]")
    };
    this.bind();
    this.draw();
  }

  bind() {
    this.document.querySelector("[data-action='acoustic-enable']")?.addEventListener("click", () => this.enable());
    this.document.querySelector("[data-action='acoustic-loopback']")?.addEventListener("click", () => this.runLoopback());
    this.document.querySelector("[data-action='acoustic-emit']")?.addEventListener("click", () => this.emitOnly());
    this.document.querySelector("[data-action='acoustic-listen']")?.addEventListener("click", () => this.listenOnly());
    this.document.querySelector("[data-action='acoustic-stop']")?.addEventListener("click", () => this.stop());
    globalThis.addEventListener?.("pagehide", () => this.close(), { once: true });
  }

  async enable() {
    this.setStatus("Requesting");
    const [microphone, output] = await Promise.all([
      this.sensor.requestMicrophonePermission(),
      this.sensor.prepareAudioOutput()
    ]);
    this.nodes.microphone.textContent = microphone.granted ? "Ready" : microphone.reason;
    this.nodes.context.textContent = output.reason || "unknown";
    this.syncStatus();
    this.write({ microphone: summarizePermission(microphone), audioOutput: summarizePermission(output) });
    if (microphone.granted) this.startMonitor();
    this.setStatus(microphone.granted && output.granted ? "Ready" : "Limited");
    return microphone.granted && output.granted;
  }

  async runLoopback() {
    if (!(await this.ensureReady())) return;
    this.setStatus("Loopback running");
    const signature = { id: "diagnostic-loopback", ...DEFAULT_CHIRP, code: 3 };
    const capture = await this.sensor.startCeremonyCapture({ maximumDurationMs: 1400 });
    let emitted;
    let detected;
    if (capture.started) {
      await wait(180);
      emitted = await this.sensor.emitChirp(signature);
      await wait(360);
      const recording = this.sensor.stopCeremonyCapture();
      [detected] = this.sensor.decodeCeremonyCapture(recording, [signature], {
        ownSignatureId: null,
        slotDurationMs: 1200,
        threshold: 0.28
      });
      detected = { ...detected, continuous: true, recordingDurationMs: recording.durationMs };
    } else {
      const detectPromise = this.sensor.detectChirp({ timeoutMs: 1800, ...signature });
      await wait(180);
      emitted = await this.sensor.emitChirp(signature);
      detected = await detectPromise;
    }
    this.write({
      test: "continuous coded speaker-to-microphone loopback",
      band: formatFrequency(DEFAULT_CHIRP.startFrequencyHz, DEFAULT_CHIRP.endFrequencyHz),
      emitted,
      capture,
      detected: detected?.continuous ? detected : summarizeDetection(detected)
    });
    this.setStatus(detected?.detected ? "Detected" : emitted?.emitted ? "Emitted, not detected" : "Emission failed");
  }

  async emitOnly() {
    if (!(await this.ensureReady())) return;
    this.setStatus("Emitting");
    const emitted = await this.sensor.emitChirp(DEFAULT_CHIRP);
    this.write({ test: "emit only", emitted });
    this.setStatus(emitted.emitted ? "Emitted" : "Emission failed");
  }

  async listenOnly() {
    if (!(await this.ensureReady())) return;
    this.setStatus("Listening");
    const detected = await this.sensor.detectChirp({
      timeoutMs: 4000,
      ...DEFAULT_CHIRP
    });
    this.write({
      test: "listen only",
      band: formatFrequency(DEFAULT_CHIRP.startFrequencyHz, DEFAULT_CHIRP.endFrequencyHz),
      detected: summarizeDetection(detected)
    });
    this.setStatus(detected.detected ? "Detected" : "Not detected");
  }

  stop() {
    globalThis.clearInterval(this.monitorTimer);
    this.monitorTimer = 0;
    this.sensor.stopCapture({ releaseStream: false });
    this.setStatus("Paused");
    this.syncStatus();
  }

  async close() {
    globalThis.clearInterval(this.monitorTimer);
    this.monitorTimer = 0;
    await this.sensor.close();
  }

  async ensureReady() {
    const status = this.sensor.getStatus();
    if (status.streamActive && status.contextState === "running") return true;
    return this.enable();
  }

  startMonitor() {
    globalThis.clearInterval(this.monitorTimer);
    this.monitorTimer = globalThis.setInterval(async () => {
      const sample = await this.sensor.sampleFrequencyBand(DEFAULT_CHIRP);
      if (!sample.available) return;
      this.history.push({
        peakDb: sample.peakDb,
        noiseDb: sample.noiseDb,
        marginDb: sample.marginDb,
        detected: sample.detected
      });
      this.history = this.history.slice(-80);
      this.nodes.margin.textContent = `${formatNumber(sample.marginDb)} dB`;
      this.nodes.rate.textContent = sample.sampleRate ? `${sample.sampleRate} Hz` : "Unknown";
      this.nodes.context.textContent = sample.contextState || "Unknown";
      this.draw();
    }, 120);
  }

  syncStatus() {
    const status = this.sensor.getStatus();
    this.nodes.microphone.textContent = status.streamActive ? "Ready" : this.nodes.microphone.textContent;
    this.nodes.context.textContent = status.contextState;
    this.nodes.rate.textContent = status.sampleRate ? `${status.sampleRate} Hz` : "Unknown";
  }

  draw() {
    const canvas = this.nodes.canvas;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#11151b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(255,255,255,.08)";
    context.lineWidth = 1;
    for (let y = 30; y < canvas.height; y += 30) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }
    if (!this.history.length) return;
    drawLine(context, this.history, canvas, "peakDb", "#44a0ff");
    drawLine(context, this.history, canvas, "noiseDb", "#657184");
    const latest = this.history[this.history.length - 1];
    context.fillStyle = latest.detected ? "#31d18b" : "#ffcc66";
    context.fillRect(canvas.width - 12, 8, 4, canvas.height - 16);
  }

  setStatus(value) {
    this.nodes.status.textContent = value;
  }

  write(value) {
    this.nodes.output.textContent = JSON.stringify(value, null, 2);
  }
}

function drawLine(context, history, canvas, key, color) {
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.beginPath();
  history.forEach((entry, index) => {
    const x = history.length === 1 ? canvas.width : index / (history.length - 1) * canvas.width;
    const normalized = Math.max(0, Math.min(1, (Number(entry[key]) + 120) / 90));
    const y = canvas.height - normalized * canvas.height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function summarizePermission(result = {}) {
  return {
    granted: Boolean(result.granted),
    reason: result.reason || null,
    cached: Boolean(result.cached)
  };
}

function summarizeDetection(result = {}) {
  return {
    detected: Boolean(result.detected),
    reason: result.reason || null,
    correlation: Number(result.correlation || 0),
    peakDb: finiteOrNull(result.band?.peakDb),
    noiseDb: finiteOrNull(result.band?.noiseDb),
    marginDb: finiteOrNull(result.band?.marginDb),
    confidence: finiteOrNull(result.band?.confidence)
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function wait(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

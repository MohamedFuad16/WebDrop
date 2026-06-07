export class UltrasoundSensor {
  constructor() {
    this.audioContext = null;
    this.oscillator = null;
    this.analyser = null;
    this.mediaStream = null;
    this.source = null;
    this.audioReady = false;
  }

  async startChirp() {
    await this.ensureAudioGraph(true);
    if (!this.audioContext || this.oscillator) return;

    this.oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    this.oscillator.type = "sine";
    this.oscillator.frequency.value = 19000;
    gain.gain.value = 0.025;
    this.oscillator.connect(gain).connect(this.audioContext.destination);
    this.oscillator.start();
  }

  stopChirp() {
    if (!this.oscillator) return;
    this.oscillator.stop();
    this.oscillator.disconnect();
    this.oscillator = null;
  }

  async getScore() {
    await this.ensureAudioGraph(false);
    if (!this.analyser) return 0;

    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);
    const sampleRate = this.audioContext.sampleRate;
    const hzPerBin = sampleRate / this.analyser.fftSize;
    const startBin = Math.floor(18000 / hzPerBin);
    const endBin = Math.min(bins.length - 1, Math.ceil(20000 / hzPerBin));
    
    let maxVal = 0;
    for (let i = startBin; i <= endBin; i++) {
      if (bins[i] > maxVal) maxVal = bins[i];
    }
    
    // Normalize 0-255 to 0-50
    return Math.min(50, Math.round((maxVal / 255) * 50));
  }

  stopListening() {
    this.stopChirp();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.audioReady = false;
  }

  async ensureAudioGraph(requestPermission = false) {
    if (this.audioContext && this.analyser) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    if (!requestPermission && !this.audioReady) return;

    this.audioContext = new AudioContextClass();
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });

    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 4096;
    this.source.connect(this.analyser);
    this.audioReady = true;
  }
}

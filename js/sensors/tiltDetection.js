export class TiltDetectionSensor {
  constructor() {
    this.tiltAt = 0;
    this.listening = false;
    this.lastSampleAt = 0;
    this.handleOrientation = this.handleOrientation.bind(this);
  }

  startListening() {
    if (this.listening || typeof window.DeviceOrientationEvent === 'undefined') return;
    this.listening = true;
    window.addEventListener("deviceorientation", this.handleOrientation, { passive: true });
  }

  stopListening() {
    if (!this.listening) return;
    window.removeEventListener("deviceorientation", this.handleOrientation);
    this.listening = false;
  }

  handleOrientation(event) {
    const now = Date.now();
    if (now - this.lastSampleAt < 160) return;
    this.lastSampleAt = now;
    const beta = Math.abs(event.beta || 0);
    const gamma = Math.abs(event.gamma || 0);
    if (beta > 30 || gamma > 30) {
      this.tiltAt = now;
    }
  }

  getScore() {
    return (Date.now() - this.tiltAt < 2200) ? 15 : 0;
  }

  simulateTilt() {
    this.tiltAt = Date.now();
  }
}

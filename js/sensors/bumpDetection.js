export class BumpDetectionSensor {
  constructor() {
    this.motionSpikeAt = 0;
    this.listening = false;
    this.lastSampleAt = 0;
    this.handleMotion = this.handleMotion.bind(this);
  }

  startListening() {
    if (this.listening || typeof window.DeviceMotionEvent === 'undefined') return;
    this.listening = true;
    window.addEventListener("devicemotion", this.handleMotion, { passive: true });
  }

  stopListening() {
    if (!this.listening) return;
    window.removeEventListener("devicemotion", this.handleMotion);
    this.listening = false;
  }

  handleMotion(event) {
    const now = Date.now();
    if (now - this.lastSampleAt < 120) return;
    this.lastSampleAt = now;
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;
    const force = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
    if (force > 24) {
      this.motionSpikeAt = now;
    }
  }

  getScore() {
    return (Date.now() - this.motionSpikeAt < 1800) ? 15 : 0;
  }

  simulateBump() {
    this.motionSpikeAt = Date.now();
  }
}

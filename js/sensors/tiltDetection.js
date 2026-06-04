export class TiltDetectionSensor {
  constructor() {
    this.tiltAt = 0;
  }

  startListening() {
    if (typeof window.DeviceOrientationEvent !== 'undefined' && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      window.DeviceOrientationEvent.requestPermission().catch(console.warn);
    }

    window.addEventListener("deviceorientation", (event) => {
      const beta = Math.abs(event.beta || 0);
      const gamma = Math.abs(event.gamma || 0);
      if (beta > 30 || gamma > 30) {
        this.tiltAt = Date.now();
      }
    });
  }

  getScore() {
    return (Date.now() - this.tiltAt < 2200) ? 15 : 0;
  }

  simulateTilt() {
    this.tiltAt = Date.now();
  }
}

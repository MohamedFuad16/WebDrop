export class BumpDetectionSensor {
  constructor() {
    this.motionSpikeAt = 0;
  }

  startListening() {
    if (typeof window.DeviceMotionEvent !== 'undefined' && typeof window.DeviceMotionEvent.requestPermission === 'function') {
      window.DeviceMotionEvent.requestPermission().catch(console.warn);
    }
    
    window.addEventListener("devicemotion", (event) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const force = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
      if (force > 24) {
        this.motionSpikeAt = Date.now();
      }
    });
  }

  getScore() {
    return (Date.now() - this.motionSpikeAt < 1800) ? 15 : 0;
  }

  simulateBump() {
    this.motionSpikeAt = Date.now();
  }
}

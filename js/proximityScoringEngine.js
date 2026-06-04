import { CONFIG } from './config.js';
import { UltrasoundSensor } from './sensors/ultrasound.js';
import { AudioChimeSensor } from './sensors/audioChime.js';
import { BumpDetectionSensor } from './sensors/bumpDetection.js';
import { TiltDetectionSensor } from './sensors/tiltDetection.js';
import { NetworkHintSensor } from './sensors/networkHint.js';

export class ProximityScoringEngine {
  constructor(bus) {
    this.bus = bus;
    this.threshold = CONFIG.proximityThreshold;
    
    this.ultrasound = new UltrasoundSensor();
    this.audioChime = new AudioChimeSensor();
    this.bump = new BumpDetectionSensor();
    this.tilt = new TiltDetectionSensor();
    this.network = new NetworkHintSensor();
  }

  startListening() {
    this.bump.startListening();
    this.tilt.startListening();
    // Network hints are driven by ICE events
    this.bus.on("network:candidate", ({ userId, candidate }) => {
      this.network.recordIceCandidate(userId, candidate);
    });
  }

  async calculateScore(user) {
    const signals = {
      ultrasound: await this.ultrasound.getScore().catch(() => 0),
      chime: await this.audioChime.getScore().catch(() => 0),
      bump: this.bump.getScore(),
      tilt: this.tilt.getScore(),
      network: this.network.getScore(user.id)
    };

    const total = Math.min(100, Object.values(signals).reduce((sum, score) => sum + score, 0));
    const passed = total >= this.threshold;
    
    const result = { userId: user.id, total, signals, passed };
    this.bus.emit("proximity:score", result);
    return result;
  }
}

import { bus } from './utils/events.js';
import { CONFIG } from './config.js';
import { DeviceDetector } from './deviceDetector.js';
import { WebSocketClient } from './websocketClient.js';
import { WebRTCClient } from './webrtcClient.js';
import { ProximityScoringEngine } from './proximityScoringEngine.js';
import { PairingManager } from './pairingManager.js';
import { OrbitUI } from './ui/orbitUI.js';
import { DynamicIslandQR } from './ui/dynamicIslandQR.js';
import { TransferUI } from './ui/transferUI.js';

class WebDropApp {
  constructor() {
    this.deviceType = DeviceDetector.getDeviceType();
    this.displayName = localStorage.getItem('webdrop-name') || `User's ${this.deviceType}`;
    
    this.wsClient = new WebSocketClient(CONFIG.signalingUrl, bus);
    this.webrtcClient = new WebRTCClient(bus, this.wsClient);
    this.proximityEngine = new ProximityScoringEngine(bus);
    this.pairingManager = new PairingManager(bus);

    this.orbitUI = new OrbitUI(document.getElementById('usersLayer'));
    this.islandQR = new DynamicIslandQR(document.getElementById('dynamicIsland'), bus);
    this.transferUI = new TransferUI({
      progressBar: document.getElementById('progressBar'),
      statusText: document.getElementById('statusNote'),
      fileSummary: document.getElementById('fileSummary')
    });
  }

  init() {
    console.log(`Starting WebDrop as ${this.deviceType}`);
    
    const deviceInfoEl = document.getElementById('deviceInfo');
    if (deviceInfoEl) {
      deviceInfoEl.textContent = `Device: ${this.deviceType} (isIOS: ${DeviceDetector.getCapabilities().isIOS})`;
    }

    this.wsClient.connect(this.displayName, this.deviceType);

    bus.on('users:discovered', users => {
      users.forEach(u => this.orbitUI.updateUser(u));
    });

    bus.on('proximity:score', scoreData => {
      console.log('Proximity score updated', scoreData);
      const user = this.orbitUI.users.get(scoreData.userId);
      if (user) {
        user.proximityScore = scoreData.total;
        this.orbitUI.updateUser(user);
        
        if (scoreData.passed) {
          this.pairingManager.initiatePairing(user);
        }
      }
    });

    bus.on('transfer:progress', progress => this.transferUI.updateProgress(progress));
    bus.on('transfer:start', meta => this.transferUI.setFileDetails(meta.name, meta.size));
    bus.on('transfer:complete', result => {
      this.transferUI.setStatus(`Transfer complete: ${result.name || 'file'}`);
      if (result.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.meta ? result.meta.name : 'download';
        a.click();
        URL.revokeObjectURL(url);
      }
    });

    // Start proximity listening if permissions exist
    this.proximityEngine.startListening();
  }

  simulateHighScore() {
    // get the first user and bump their score
    const firstUserId = Array.from(this.orbitUI.users.keys())[0];
    if (firstUserId) {
      bus.emit('proximity:score', { userId: firstUserId, total: 85, passed: true, signals: {} });
    } else {
      // Create a dummy user if none exist
      const dummyId = crypto.randomUUID();
      this.orbitUI.updateUser({ id: dummyId, displayName: 'Dummy iPhone', deviceType: 'iPhone', proximityScore: 0 });
      setTimeout(() => {
        bus.emit('proximity:score', { userId: dummyId, total: 85, passed: true, signals: {} });
      }, 500);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new WebDropApp();
  app.init();
  window.WebDrop = app; // Expose for debugging
});

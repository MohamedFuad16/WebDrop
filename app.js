import { bus } from './js/utils/events.js?v=20260605';
import { CONFIG } from './js/config.js?v=20260605';
import { DeviceDetector } from './js/deviceDetector.js?v=20260605';
import { WebSocketClient } from './js/websocketClient.js?v=20260605';
import { WebRTCClient } from './js/webrtcClient.js?v=20260605';
import { ProximityScoringEngine } from './js/proximityScoringEngine.js?v=20260605';
import { PairingManager } from './js/pairingManager.js?v=20260605';
import { DynamicIslandQR } from './js/ui/dynamicIslandQR.js?v=20260605';
import { TransferUI } from './js/ui/transferUI.js?v=20260605';

class WebDropApp {
  constructor() {
    this.deviceType = DeviceDetector.getDeviceType();
    this.displayName = localStorage.getItem('wd_user_name') || `User's ${this.deviceType}`;
    this.users = new Map();
    
    this.wsClient = new WebSocketClient(CONFIG.signalingUrl, bus);
    this.webrtcClient = new WebRTCClient(bus, this.wsClient);
    this.proximityEngine = new ProximityScoringEngine(bus);
    this.pairingManager = new PairingManager(bus);

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

    // Notify the UI layer
    window.dispatchEvent(new CustomEvent('webdrop:ready', { detail: { deviceType: this.deviceType } }));

    this.wsClient.connect(this.displayName, this.deviceType);

    bus.on('users:discovered', users => {
      this.users.clear();
      users
        .filter(user => user.clientId !== this.wsClient.clientId)
        .forEach(user => this.users.set(user.clientId, { ...user, id: user.clientId }));
    });

    bus.on('proximity:score', scoreData => {
      console.log('Proximity score updated', scoreData);
      const user = this.users.get(scoreData.userId);
      if (user) {
        user.proximityScore = scoreData.total;
        
        if (scoreData.passed) {
          this.pairingManager.initiatePairing(user);
        }
      }
    });

    bus.on('webrtc:signal', async payload => {
      try {
        if (payload.type === 'offer') await this.webrtcClient.handleOffer(payload);
        else if (payload.type === 'answer') await this.webrtcClient.handleAnswer(payload);
        else if (payload.type === 'candidate') await this.webrtcClient.handleCandidate(payload);
      } catch (error) {
        console.error('[WebRTC] Signaling failed:', error);
      }
    });

    bus.on('qr:paired', async ({ peer, initiator }) => {
      if (!peer || !peer.clientId) return;
      this.users.set(peer.clientId, { ...peer, id: peer.clientId });
      if (initiator) {
        try {
          await this.webrtcClient.createOffer(peer.clientId);
        } catch (error) {
          console.error('[WebRTC] Could not start paired connection:', error);
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

    window.addEventListener('online', () => this.wsClient.connect(this.displayName, this.deviceType));
  }

  simulateHighScore() {
    // get the first user and bump their score
    const firstUserId = Array.from(this.users.keys())[0];
    if (firstUserId) {
      bus.emit('proximity:score', { userId: firstUserId, total: 85, passed: true, signals: {} });
    } else {
      // Create a dummy user if none exist
      const dummyId = crypto.randomUUID();
      this.users.set(dummyId, { id: dummyId, clientId: dummyId, displayName: 'Dummy iPhone', deviceType: 'iPhone', proximityScore: 0 });
      setTimeout(() => {
        bus.emit('proximity:score', { userId: dummyId, total: 85, passed: true, signals: {} });
      }, 500);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new WebDropApp();
  window.WebDrop = app; // Expose for debugging
  app.init();
});

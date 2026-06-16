import { Emitter } from "../utils/emitter.js";
import { AVATAR_OPTIONS } from "../config/avatar-options.js";

const MOCK_PEERS = [
  { id: "peer-aki", name: "Aki iPhone", avatar: AVATAR_OPTIONS[1], ringIndex: 0, angle: -52, deviceFamily: "ios", deviceLabel: "iPhone 15 Pro", distanceBucket: "immediate", proximityScore: 54, connectedBefore: true, capabilities: { platform: { family: "ios", isIOS: true, isIPhone: true, dynamicIslandCapable: true } } },
  { id: "peer-ren", name: "Ren Pixel", avatar: AVATAR_OPTIONS[2], ringIndex: 1, angle: 18, deviceFamily: "android", deviceLabel: "Pixel 8", distanceBucket: "immediate", proximityScore: 51, capabilities: { platform: { family: "android", isIOS: false, isIPhone: false } } },
  { id: "peer-mio", name: "Mio Galaxy", avatar: AVATAR_OPTIONS[3], ringIndex: 2, angle: 92, deviceFamily: "android", deviceLabel: "Galaxy S25", distanceBucket: "near", proximityScore: 50, connectedBefore: true },
  { id: "peer-noa", name: "Noa Tab", avatar: AVATAR_OPTIONS[4], ringIndex: 0, angle: 68, deviceFamily: "ipad", deviceLabel: "iPad Air", distanceBucket: "near", proximityScore: 48 },
  { id: "peer-sora", name: "Sora Mac", avatar: AVATAR_OPTIONS[5], ringIndex: 1, angle: 198, deviceFamily: "macos", deviceLabel: "MacBook Air", distanceBucket: "room", proximityScore: 49, previousConnections: 3, online: false },
  { id: "peer-kai", name: "Kai Watch", avatar: AVATAR_OPTIONS[6], ringIndex: 2, angle: 272, deviceFamily: "watchos", deviceLabel: "Apple Watch", distanceBucket: "room", proximityScore: 45 },
  { id: "peer-yui", name: "Yui Pad", avatar: AVATAR_OPTIONS[7], ringIndex: 0, angle: 188, deviceFamily: "ipad", deviceLabel: "iPad Pro", distanceBucket: "near", proximityScore: 47 },
  { id: "peer-emi", name: "Emi iPhone", avatar: AVATAR_OPTIONS[0], ringIndex: 3, angle: 4, deviceFamily: "ios", deviceLabel: "iPhone 16", distanceBucket: "near", proximityScore: 43, connectedBefore: true },
  { id: "peer-haru", name: "Haru Android", avatar: AVATAR_OPTIONS[1], ringIndex: 1, angle: 306, deviceFamily: "android", deviceLabel: "Android Tablet", distanceBucket: "room", proximityScore: 46 },
  { id: "peer-lina", name: "Lina iPhone", avatar: AVATAR_OPTIONS[2], ringIndex: 2, angle: 212, deviceFamily: "ios", deviceLabel: "iPhone 15", distanceBucket: "room", proximityScore: 44 },
  { id: "peer-omar", name: "Omar Surface", avatar: AVATAR_OPTIONS[3], ringIndex: 0, angle: 302, deviceFamily: "windows", deviceLabel: "Surface Laptop", distanceBucket: "building", proximityScore: 42, online: false },
  { id: "peer-maya", name: "Maya Pixel", avatar: AVATAR_OPTIONS[4], ringIndex: 3, angle: 126, deviceFamily: "android", deviceLabel: "Pixel Fold", distanceBucket: "room", proximityScore: 40 },
  { id: "peer-jun", name: "Jun iPhone", avatar: AVATAR_OPTIONS[5], ringIndex: 3, angle: 246, deviceFamily: "ios", deviceLabel: "iPhone 14", distanceBucket: "building", proximityScore: 34 },
  { id: "peer-tala", name: "Tala Mac", avatar: AVATAR_OPTIONS[6], ringIndex: 1, angle: 108, deviceFamily: "macos", deviceLabel: "Mac mini", distanceBucket: "far", proximityScore: 30, online: false },
  { id: "peer-zed", name: "Zed Droid", avatar: AVATAR_OPTIONS[7], ringIndex: 2, angle: 332, deviceFamily: "android", deviceLabel: "Android Phone", distanceBucket: "far", proximityScore: 27 }
];

export class MockSignalingAdapter extends Emitter {
  async connect({ self, capabilities }) {
    this.self = self;
    this.capabilities = capabilities;
    queueMicrotask(() => {
      this.emit("connected", { mode: "mock" });
      this.emit("peers", MOCK_PEERS);
    });
  }

  async disconnect() {
    this.emit("disconnected");
  }

  async sendInvite(peerId) {
    this.emit("peers", MOCK_PEERS.map((peer) =>
      peer.id === peerId ? { ...peer, stage: "intent" } : peer
    ));
    setTimeout(() => this.emit("inviteAccepted", { peerId, pairingId: `pair-${peerId}` }), 700);
  }

  async acceptInvite(peerId) {
    this.emit("inviteAccepted", { peerId, pairingId: `pair-${peerId}` });
  }

  async sendProximityTelemetry(peerId, metrics) {
    this.emit("telemetry", { peerId, metrics });
  }

  async sendRtcSignal(peerId, signal) {
    this.emit("rtcSignal", { peerId, signal });
  }

  async disconnectPeer(peerId) {
    this.emit("peers", MOCK_PEERS);
    this.emit("peerDisconnected", { peerId });
  }

  async issueQrToken(targetId, pairingId) {
    const token = `mock-webdrop:${pairingId}:${targetId}`;
    queueMicrotask(() => this.emit("proximity:qr:issued", { token, pairingId, expiresAt: Date.now() + 120000 }));
    return true;
  }

  async verifyQrToken(targetId, pairingId) {
    queueMicrotask(() => this.emit("proximity:qr:verified", {
      valid: true,
      pairingId,
      verifiedAt: new Date().toISOString()
    }));
    return true;
  }

  async sendProximityFallback(peerId, pairingId) {
    queueMicrotask(() => this.emit("proximity:fallback", { fromId: peerId, pairingId }));
    return true;
  }
}

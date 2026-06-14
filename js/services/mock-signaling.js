import { Emitter } from "../utils/emitter.js";
import { AVATAR_OPTIONS } from "../config/avatar-options.js";

const MOCK_PEERS = [
  { id: "peer-aki", name: "Aki iPhone", avatar: AVATAR_OPTIONS[1], ringIndex: 0, angle: -52 },
  { id: "peer-ren", name: "Ren Pixel", avatar: AVATAR_OPTIONS[2], ringIndex: 1, angle: 18 },
  { id: "peer-mio", name: "Mio Galaxy", avatar: AVATAR_OPTIONS[3], ringIndex: 2, angle: 92 },
  { id: "peer-noa", name: "Noa Tab", avatar: AVATAR_OPTIONS[4], ringIndex: 0, angle: 68 },
  { id: "peer-sora", name: "Sora Mac", avatar: AVATAR_OPTIONS[5], ringIndex: 1, angle: 198 },
  { id: "peer-kai", name: "Kai Watch", avatar: AVATAR_OPTIONS[6], ringIndex: 2, angle: 272 },
  { id: "peer-yui", name: "Yui Pad", avatar: AVATAR_OPTIONS[7], ringIndex: 0, angle: 188 }
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
}

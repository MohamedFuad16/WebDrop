import { Emitter } from "../utils/emitter.js";

export class WebSocketSignalingAdapter extends Emitter {
  constructor({ url }) {
    super();
    this.url = url;
    this.socket = null;
  }

  async connect(payload) {
    if (!this.url) {
      this.emit("unconfigured", { reason: "Production WSS endpoint is intentionally not built in this repo." });
      return;
    }
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("open", () => {
      this.send({ type: "client:hello", payload });
      this.emit("connected", { mode: "wss" });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      this.emit(message.type, message.payload);
    });
  }

  async disconnect() {
    this.socket?.close();
  }

  async sendInvite(targetId) {
    this.send({ type: "invite", targetId });
  }

  async acceptInvite(pairingId) {
    this.send({ type: "invite:accept", pairingId });
  }

  async sendProximityTelemetry(targetId, metrics) {
    this.send({ type: "proximity:telemetry", targetId, metrics });
  }

  async sendRtcSignal(targetId, signal) {
    this.send({ type: "rtc:signal", targetId, signal });
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}

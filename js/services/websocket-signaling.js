import { Emitter } from "../utils/emitter.js?v=1.0.70";

export class WebSocketSignalingAdapter extends Emitter {
  constructor({
    url,
    protocols,
    WebSocketImpl = globalThis.WebSocket,
    handshakeTimeoutMs = 8000,
    setTimeoutImpl,
    clearTimeoutImpl
  } = {}) {
    super();
    this.url = url;
    this.protocols = protocols;
    this.WebSocketImpl = WebSocketImpl;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.setTimeoutImpl = setTimeoutImpl || ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.clearTimeoutImpl = clearTimeoutImpl || ((timer) => globalThis.clearTimeout(timer));
    this.socket = null;
    this.connectPromise = null;
    this.turnAccessToken = "";
    this.selfId = "";
    this.heartbeatTimer = 0;
    this.reconnectTimer = 0;
    this.reconnectAttempt = 0;
    this.lastConnectPayload = null;
    this.shouldReconnect = false;
  }

  async connect(payload) {
    if (!this.url) {
      this.emit("unconfigured", { reason: "Production signaling URL is not configured." });
      return false;
    }
    if (!this.WebSocketImpl) throw new Error("WebSocket is not available in this environment.");
    this.lastConnectPayload = payload || this.lastConnectPayload;
    this.shouldReconnect = true;
    if (this.socket?.readyState === this.WebSocketImpl.OPEN) return true;
    if (this.connectPromise) return this.connectPromise;

    const socket = this.protocols
      ? new this.WebSocketImpl(this.url, this.protocols)
      : new this.WebSocketImpl(this.url);
    this.socket = socket;
    this.selfId = payload?.self?.id || "";
    this.connectPromise = new Promise((resolve, reject) => {
      let handshakeTimer = 0;
      const cleanupHandshake = () => {
        this.clearTimeoutImpl(handshakeTimer);
        handshakeTimer = 0;
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onCloseBeforeOpen);
      };
      const onOpen = () => {
        cleanupHandshake();
        this.reconnectAttempt = 0;
        this.send({ type: "client:hello", payload });
        this.emit("connected", { mode: "wss" });
        resolve(true);
      };
      const onError = () => {
        cleanupHandshake();
        this.scheduleReconnect();
        this.emit("connection-failed", { reason: "socket-error-before-open" });
        resolve(false);
      };
      const onCloseBeforeOpen = () => {
        cleanupHandshake();
        this.scheduleReconnect();
        this.emit("connection-failed", { reason: "socket-closed-before-open" });
        resolve(false);
      };
      const onHandshakeTimeout = () => {
        cleanupHandshake();
        this.emit("connection-failed", { reason: "socket-handshake-timeout" });
        this.scheduleReconnect();
        socket.close();
        resolve(false);
      };
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onError, { once: true });
      socket.addEventListener("close", onCloseBeforeOpen, { once: true });
      handshakeTimer = this.setTimeoutImpl(onHandshakeTimeout, this.handshakeTimeoutMs);
    }).finally(() => {
      this.connectPromise = null;
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        this.emit("error", { error, reason: "invalid-json" });
        return;
      }
      if (!message?.type) return;
      if (message.type === "connected") {
        this.turnAccessToken = message.payload?.turnAccessToken || "";
        this.startHeartbeat();
      }
      this.emit(message.type, message.payload);
      if (message.type === "rtc:signal") {
        this.emit("rtcSignal", normalizeRtcSignal(message));
      }
      if (message.type === "invite:accept") {
        this.emit("inviteAccepted", {
          peerId: message.payload?.fromId,
          pairingId: message.payload?.pairingId
        });
      }
      if (message.type === "peer:disconnected") {
        this.emit("peerDisconnected", message.payload);
      }
    });
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopHeartbeat();
      this.turnAccessToken = "";
      this.emit("disconnected", { code: event.code, reason: event.reason });
      this.scheduleReconnect();
    });
    socket.addEventListener("error", (event) => {
      this.emit("error", { error: new Error("Production signaling socket error."), event });
    });
    return this.connectPromise;
  }

  async disconnect() {
    this.shouldReconnect = false;
    this.clearTimeoutImpl(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
  }

  async sendInvite(targetId, { method = "proximity", qrRole = null } = {}) {
    this.send({ type: "invite", targetId, payload: { method, qrRole } });
  }

  async acceptInvite(targetId, pairingId) {
    return this.send({ type: "invite:accept", targetId, pairingId });
  }

  async rejectInvite(targetId, pairingId) {
    return this.send({ type: "invite:reject", targetId, pairingId });
  }

  async sendProximityTelemetry(targetId, metrics, { pairingId } = {}) {
    return this.send({ type: "proximity:telemetry", targetId, pairingId, metrics });
  }

  async sendProximityReady(targetId, pairingId) {
    return this.send({ type: "proximity:ready", targetId, pairingId });
  }

  async joinProximitySession(payload = {}) {
    return this.send({ type: "proximity:session:join", payload });
  }

  async sendProximitySessionTelemetry(payload = {}) {
    return this.send({ type: "proximity:session:telemetry", payload });
  }

  async cancelProximitySession(sessionId) {
    return this.send({ type: "proximity:session:cancel", payload: { sessionId } });
  }

  async sendRtcSignal(targetId, signal, { pairingId } = {}) {
    return this.send({ type: "rtc:signal", targetId, pairingId, signal });
  }

  async sendChatMessage(targetId, payload, { pairingId } = {}) {
    return this.send({ type: "chat:message", targetId, pairingId, payload });
  }

  async sendTransferManifest(targetId, payload, { pairingId } = {}) {
    return this.send({ type: "transfer:manifest", targetId, pairingId, payload });
  }

  async sendTransferControl(targetId, payload, { pairingId } = {}) {
    return this.send({ type: "transfer:control", targetId, pairingId, payload });
  }

  async issueQrToken(targetId, pairingId) {
    return this.send({ type: "proximity:qr:issue", targetId, pairingId });
  }

  async verifyQrToken(targetId, pairingId, token) {
    return this.send({ type: "proximity:qr:verify", targetId, pairingId, payload: { token } });
  }

  async issuePeerlessQrToken() {
    return this.send({ type: "proximity:qr:issue", payload: {} });
  }

  async verifyPeerlessQrToken(token) {
    return this.send({ type: "proximity:qr:verify", payload: { token } });
  }

  async sendProximityFallback(targetId, pairingId) {
    return this.send({ type: "proximity:fallback", targetId, pairingId });
  }

  async sendPathMetric(targetId, payload, { pairingId } = {}) {
    return this.send({ type: "rtc:path-metric", targetId, pairingId, payload });
  }

  async disconnectPeer(targetId, pairingId) {
    return this.send({ type: "peer:disconnect", targetId, pairingId });
  }

  send(message) {
    if (this.socket?.readyState === this.WebSocketImpl?.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    this.emit("send-skipped", { reason: "socket-not-open", messageType: message?.type });
    return false;
  }

  getTurnAuthorization() {
    return this.turnAccessToken
      ? { token: this.turnAccessToken, clientId: this.selfId }
      : null;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = globalThis.setInterval(() => this.send({ type: "client:ping" }), 20000);
  }

  stopHeartbeat() {
    globalThis.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
  }

  scheduleReconnect() {
    if (!this.shouldReconnect || !this.url || !this.lastConnectPayload || this.reconnectTimer) return;
    const delay = Math.min(15000, 1000 * (2 ** this.reconnectAttempt));
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimeoutImpl(() => {
      this.reconnectTimer = 0;
      this.connect(this.lastConnectPayload).catch(() => this.scheduleReconnect());
    }, delay);
  }
}

function normalizeRtcSignal(message) {
  const payload = message.payload || {};
  return {
    peerId: payload.peerId || payload.sourceId || payload.fromId || message.sourceId,
    pairingId: payload.pairingId || message.pairingId,
    signal: payload.signal || message.signal || payload
  };
}

import { Emitter } from "../utils/emitter.js?v=1.0.41";
import {
  DATA_CHANNEL_LABELS,
  DataChannelTransferProtocol
} from "./data-channel-transfer-protocol.js";

export class WebRtcTransport extends Emitter {
  constructor({
    signaling,
    turnConfig,
    enabled = false,
    rtcConfig = {},
    protocolOptions = {}
  }) {
    super();
    this.signaling = signaling;
    this.turnConfig = turnConfig;
    this.enabled = enabled;
    this.rtcConfig = rtcConfig;
    this.protocolOptions = protocolOptions;
    this.peerConnection = null;
    this.peerConnectionPromise = null;
    this.channel = null;
    this.controlChannel = null;
    this.fileChannel = null;
    this.protocol = null;
    this.peerId = null;
    this.pairingId = null;
    this.pendingCandidates = [];
    this.signalingCleanups = [];
    this.chunkHandler = null;
    this._bindSignaling();
  }

  enable({ peerId, pairingId, rtcConfig, protocolOptions } = {}) {
    this.enabled = true;
    if (peerId) this.peerId = peerId;
    if (pairingId) this.pairingId = pairingId;
    if (rtcConfig) this.rtcConfig = { ...this.rtcConfig, ...rtcConfig };
    if (protocolOptions) this.protocolOptions = { ...this.protocolOptions, ...protocolOptions };
    this._bindSignaling();
    return this;
  }

  async connect(peerId = this.peerId, { pairingId = this.pairingId, initiator = true } = {}) {
    if (!this.enabled) {
      throw new Error("Production WebRTC transport is disabled. Call enable() before connect().");
    }
    if (!peerId) throw new Error("A peerId is required to establish WebRTC transport.");
    this.peerId = peerId;
    this.pairingId = pairingId;
    this._bindSignaling();
    this.emit("connect-start", { peerId, pairingId, initiator });
    await this._createPeerConnection({ initiator });
    if (initiator) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await this._sendSignal({ type: "offer", description: this.peerConnection.localDescription });
    }
    return this;
  }

  async preflight(peerId) {
    const iceServers = await this.turnConfig.getIceServers();
    if (!("RTCPeerConnection" in globalThis)) return "failed";
    if (this.enabled && peerId) {
      await this.connect(peerId, { initiator: true });
      await wait(450);
      return this.classifyPathFromStats();
    }

    const probe = new RTCPeerConnection({ ...this.rtcConfig, iceServers });
    probe.createDataChannel("webdrop-preflight", { ordered: true });
    await wait(450);
    probe.close();
    return globalThis.navigator?.connection?.type === "cellular" ? "relay" : "direct";
  }

  async classifyPathFromStats() {
    return (await this.getPathStats()).path;
  }

  async getPathStats() {
    const summary = {
      path: "unknown",
      connectionState: this.peerConnection?.connectionState || "closed",
      iceConnectionState: this.peerConnection?.iceConnectionState || "closed",
      currentRoundTripTime: null,
      availableOutgoingBitrate: null,
      localCandidate: null,
      remoteCandidate: null
    };
    if (!this.peerConnection?.getStats) return summary;

    const stats = await this.peerConnection.getStats();
    let selectedPair = null;
    for (const report of stats.values()) {
      if (report.type === "transport" && report.selectedCandidatePairId) {
        selectedPair = stats.get(report.selectedCandidatePairId);
      }
      if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
        selectedPair = report;
      }
    }
    if (!selectedPair) return summary;
    summary.currentRoundTripTime = selectedPair.currentRoundTripTime ?? null;
    summary.availableOutgoingBitrate = selectedPair.availableOutgoingBitrate ?? null;
    summary.localCandidate = stats.get(selectedPair.localCandidateId) || null;
    summary.remoteCandidate = stats.get(selectedPair.remoteCandidateId) || null;
    summary.path = summary.localCandidate?.candidateType === "relay"
      || summary.remoteCandidate?.candidateType === "relay"
      ? "relay"
      : summary.localCandidate || summary.remoteCandidate
        ? "direct"
        : "unknown";
    return summary;
  }

  sendChunk(chunk) {
    if (this.fileChannel?.readyState !== "open") return false;
    if (this.fileChannel.bufferedAmount > (this.protocol?.highWaterMark || 8 * 1024 * 1024)) {
      return false;
    }
    this.fileChannel.send(chunk);
    return true;
  }

  async sendFiles(files, options) {
    if (!this.enabled) {
      throw new Error("Production WebRTC transfer is disabled. Call enable() before sendFiles().");
    }
    if (!this.protocol) throw new Error("WebRTC data channels are not ready.");
    return this.protocol.sendFiles(files, options);
  }

  cancelTransfer(transferId, reason) {
    this.protocol?.cancel(transferId, reason);
  }

  retryTransfer(transferId, fileId, offset, reason) {
    this.protocol?.requestRetry(transferId, fileId, offset, reason);
  }

  acknowledgeTransferComplete(transferId, details) {
    this.protocol?.acknowledgeCompletion(transferId, details);
  }

  acknowledgeReceiverReady(transferId) {
    this.protocol?.acknowledgeReceiverReady(transferId);
  }

  setChunkHandler(handler) {
    this.chunkHandler = typeof handler === "function" ? handler : null;
    this.protocol?.setChunkHandler(this.chunkHandler);
  }

  async handleSignal(payload) {
    if (!this.enabled) {
      this.emit("signal-ignored", { reason: "transport-disabled", payload });
      return false;
    }
    const { peerId, pairingId, signal } = normalizeSignal(payload);
    if (!signal?.type) return false;
    if (this.peerId && peerId && peerId !== this.peerId) return false;
    this.peerId = this.peerId || peerId;
    this.pairingId = this.pairingId || pairingId;

    const connection = await this._createPeerConnection({ initiator: false });
    switch (signal.type) {
      case "offer": {
        await connection.setRemoteDescription(normalizeSessionDescription(signal, "offer"));
        await this._flushPendingCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await this._sendSignal({ type: "answer", description: connection.localDescription });
        break;
      }
      case "answer":
        await connection.setRemoteDescription(normalizeSessionDescription(signal, "answer"));
        await this._flushPendingCandidates();
        break;
      case "candidate":
      case "ice-candidate":
        if (signal.candidate && connection.remoteDescription) {
          await connection.addIceCandidate(signal.candidate);
        } else if (signal.candidate) {
          this.pendingCandidates.push(signal.candidate);
        }
        break;
      default:
        this.emit("signal-ignored", { reason: "unsupported-signal", payload });
        return false;
    }
    this.emit("signal-handled", { peerId: this.peerId, type: signal.type });
    return true;
  }

  close() {
    this.protocol?.close({ closeChannels: true });
    try {
      this.controlChannel?.close();
      this.fileChannel?.close();
    } catch {
      // Closing is best-effort; stale browser channels should not block disconnect.
    }
    try {
      this.peerConnection?.close();
    } catch {
      // Closing is best-effort; stale browser transports should not block reconnect.
    }
    for (const cleanup of this.signalingCleanups.splice(0)) cleanup();
    this.protocol = null;
    this.controlChannel = null;
    this.fileChannel = null;
    this.channel = null;
    this.peerConnection = null;
    this.peerConnectionPromise = null;
    this.pendingCandidates = [];
    this.peerId = null;
    this.pairingId = null;
    this.emit("closed");
  }

  async _createPeerConnection({ initiator }) {
    if (this.peerConnection) return this.peerConnection;
    if (this.peerConnectionPromise) return this.peerConnectionPromise;

    this.peerConnectionPromise = (async () => {
      const iceServers = await this.turnConfig.getIceServers();
      this.emit("peer-connection-create", { initiator, iceServerCount: iceServers.length });
      const connection = new RTCPeerConnection({ ...this.rtcConfig, iceServers });
      this.peerConnection = connection;
      connection.addEventListener("icecandidate", ({ candidate }) => {
        if (candidate) this._sendSignal({ type: "ice-candidate", candidate }).catch((error) => {
          this.emit("error", { error, stage: "ice-candidate" });
        });
      });
      connection.addEventListener("datachannel", ({ channel }) => this._attachDataChannel(channel));
      connection.addEventListener("connectionstatechange", () => {
        this.emit("connection-state", { state: connection.connectionState });
        if (["connected", "failed", "disconnected"].includes(connection.connectionState)) {
          this.getPathStats().then((stats) => this.emit("path-stats", stats)).catch(() => {});
        }
      });
      connection.addEventListener("iceconnectionstatechange", () => {
        this.emit("ice-state", { state: connection.iceConnectionState });
      });

      if (initiator) {
        this._attachDataChannel(connection.createDataChannel(DATA_CHANNEL_LABELS.control, {
          ordered: true
        }));
        this._attachDataChannel(connection.createDataChannel(DATA_CHANNEL_LABELS.file, {
          ordered: true
        }));
      }
      return connection;
    })();

    try {
      return await this.peerConnectionPromise;
    } finally {
      this.peerConnectionPromise = null;
    }
  }

  _attachDataChannel(channel) {
    if (channel.label === DATA_CHANNEL_LABELS.control) this.controlChannel = channel;
    else if (channel.label === DATA_CHANNEL_LABELS.file) {
      this.fileChannel = channel;
      this.channel = channel;
    } else {
      channel.close();
      this.emit("channel-rejected", { label: channel.label });
      return;
    }

    if (!this.protocol) {
      this.protocol = new DataChannelTransferProtocol(this.protocolOptions);
      this.protocol.setChunkHandler(this.chunkHandler);
      for (const type of [
        "channel-open",
        "channel-close",
        "channel-error",
        "protocol-error",
        "manifest",
        "chunk",
        "progress",
        "ack",
        "sent",
        "complete",
        "canceled",
        "failed",
        "retry-requested"
      ]) {
        this.protocol.on(type, (payload) => this.emit(type, payload));
      }
    }
    this.protocol.attachChannel(channel);
    this.emit("data-channel", { label: channel.label, channel });
  }

  async _sendSignal(signal) {
    this.emit("signal-send", { type: signal.type, peerId: this.peerId, pairingId: this.pairingId });
    const sent = await this.signaling.sendRtcSignal(this.peerId, normalizeOutboundSignal(signal), {
      pairingId: this.pairingId
    });
    if (sent === false) throw new Error("RTC signal could not be sent.");
  }

  async _flushPendingCandidates() {
    const connection = this.peerConnection;
    if (!connection) return;
    for (const candidate of this.pendingCandidates.splice(0)) {
      await connection.addIceCandidate(candidate);
    }
  }

  _bindSignaling() {
    if (this.signalingCleanups.length || !this.signaling?.on) return;
    this.signalingCleanups.push(
      this.signaling.on("rtcSignal", (payload) => {
        this.handleSignal(payload).catch((error) => this.emit("error", { error, stage: "signal" }));
      })
    );
  }
}

function normalizeOutboundSignal(signal) {
  if (signal.type === "offer" || signal.type === "answer") {
    return {
      type: signal.type,
      sdp: signal.description?.sdp || signal.sdp || ""
    };
  }
  if (signal.type === "ice-candidate" || signal.type === "candidate") {
    return {
      type: "candidate",
      candidate: signal.candidate?.toJSON?.() || signal.candidate
    };
  }
  return signal;
}

function normalizeSignal(payload) {
  return {
    peerId: payload?.peerId || payload?.sourceId || payload?.fromId,
    pairingId: payload?.pairingId,
    signal: payload?.signal || payload
  };
}

function normalizeSessionDescription(signal, fallbackType) {
  const description = signal.description || signal;
  const type = description.type || signal.type || fallbackType;
  return {
    type,
    sdp: normalizeSdp(description.sdp || signal.sdp || "")
  };
}

function normalizeSdp(sdp) {
  return String(sdp || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join("\r\n")
    .concat("\r\n");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

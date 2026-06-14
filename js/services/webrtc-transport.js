export class WebRtcTransport {
  constructor({ signaling, turnConfig }) {
    this.signaling = signaling;
    this.turnConfig = turnConfig;
    this.peerConnection = null;
    this.channel = null;
  }

  async preflight() {
    this.close();
    const iceServers = await this.turnConfig.getIceServers();
    if (!("RTCPeerConnection" in window)) return "failed";
    this.peerConnection = new RTCPeerConnection({ iceServers });
    this.channel = this.peerConnection.createDataChannel("binary_stream", { ordered: true });
    await wait(450);
    return navigator.connection?.type === "cellular" ? "relay" : "direct";
  }

  async classifyPathFromStats() {
    if (!this.peerConnection?.getStats) return "unknown";
    const stats = await this.peerConnection.getStats();
    for (const report of stats.values()) {
      if (report.type === "local-candidate" && report.candidateType === "relay") return "relay";
      if (report.type === "local-candidate" && ["host", "srflx", "prflx"].includes(report.candidateType)) {
        return "direct";
      }
    }
    return "unknown";
  }

  sendChunk(chunk) {
    if (this.channel?.readyState === "open") {
      this.channel.send(chunk);
    }
  }

  close() {
    try {
      this.channel?.close();
    } catch {
      // Closing is best-effort; stale browser channels should not block disconnect.
    }
    try {
      this.peerConnection?.close();
    } catch {
      // Closing is best-effort; stale browser transports should not block reconnect.
    }
    this.channel = null;
    this.peerConnection = null;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

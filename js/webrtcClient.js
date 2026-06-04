import { CONFIG } from './config.js';

export class WebRTCClient {
  constructor(bus, websocket) {
    this.bus = bus;
    this.websocket = websocket;
    this.peerConnection = null;
    this.dataChannel = null;
    this.receiveBuffer = [];
    this.receiveMeta = null;
  }

  createPeerConnection(remoteClientId) {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    this.peerConnection.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.bus.emit("network:candidate", { userId: remoteClientId, candidate: event.candidate.candidate });
        this.websocket.sendSignal(remoteClientId, { type: 'candidate', candidate: event.candidate });
      }
    });

    this.peerConnection.addEventListener("datachannel", (event) => {
      this.attachDataChannel(event.channel);
    });

    this.peerConnection.addEventListener("connectionstatechange", () => {
      this.bus.emit("webrtc:state", this.peerConnection.connectionState);
    });

    return this.peerConnection;
  }

  async createOffer(remoteClientId) {
    const peer = this.createPeerConnection(remoteClientId);
    this.attachDataChannel(peer.createDataChannel("webdrop-files", { ordered: true }));

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.websocket.sendSignal(remoteClientId, { type: 'offer', description: peer.localDescription });
  }

  async handleOffer(payload) {
    const peer = this.createPeerConnection(payload.from);
    await peer.setRemoteDescription(payload.description);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    this.websocket.sendSignal(payload.from, { type: 'answer', description: peer.localDescription });
  }

  async handleAnswer(payload) {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(payload.description);
    }
  }

  async handleCandidate(payload) {
    if (this.peerConnection && payload.candidate) {
      await this.peerConnection.addIceCandidate(payload.candidate);
    }
  }

  attachDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.binaryType = "arraybuffer";
    this.dataChannel.addEventListener("open", () => this.bus.emit("transfer:ready"));
    this.dataChannel.addEventListener("message", (event) => this.handleDataMessage(event.data));
    this.dataChannel.addEventListener("close", () => this.bus.emit("transfer:closed"));
  }

  async sendFile(file) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.bus.emit("transfer:error", "Peer channel not open.");
      return;
    }

    this.bus.emit("transfer:start", { name: file.name, size: file.size });
    this.dataChannel.send(JSON.stringify({ type: "file-meta", name: file.name, size: file.size, mime: file.type }));

    let offset = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + CONFIG.chunkSize);
      const buffer = await chunk.arrayBuffer();
      this.dataChannel.send(buffer);
      offset += buffer.byteLength;
      this.bus.emit("transfer:progress", Math.min(100, Math.round((offset / file.size) * 100)));
      await this.waitForBufferedAmount();
    }

    this.dataChannel.send(JSON.stringify({ type: "file-complete" }));
    this.bus.emit("transfer:complete", { direction: "sent", name: file.name });
  }

  handleDataMessage(data) {
    if (typeof data === "string") {
      const message = JSON.parse(data);
      if (message.type === "file-meta") {
        this.receiveMeta = message;
        this.receiveBuffer = [];
        this.bus.emit("transfer:start", message);
      } else if (message.type === "file-complete") {
        const blob = new Blob(this.receiveBuffer, { type: this.receiveMeta ? this.receiveMeta.mime : "application/octet-stream" });
        this.bus.emit("transfer:complete", { direction: "received", blob, meta: this.receiveMeta });
        this.receiveBuffer = [];
        this.receiveMeta = null;
      }
      return;
    }
    this.receiveBuffer.push(data);
    if (this.receiveMeta) {
      const bytesReceived = this.receiveBuffer.reduce((total, chunk) => total + chunk.byteLength, 0);
      this.bus.emit("transfer:progress", Math.min(100, Math.round((bytesReceived / this.receiveMeta.size) * 100)));
    }
  }

  waitForBufferedAmount() {
    return new Promise((resolve) => {
      if (!this.dataChannel || this.dataChannel.bufferedAmount < CONFIG.chunkSize * 4) {
        resolve();
        return;
      }
      this.dataChannel.bufferedAmountLowThreshold = CONFIG.chunkSize * 2;
      this.dataChannel.addEventListener("bufferedamountlow", resolve, { once: true });
    });
  }
}

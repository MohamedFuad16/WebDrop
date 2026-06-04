(function () {
  "use strict";

  const CONFIG = {
    signalingUrl: "wss://example.com/webdrop-signaling",
    proximityThreshold: 60,
    chunkSize: 16 * 1024,
    demoUsers: [
      { id: "demo-1", name: "Maya" },
      { id: "demo-2", name: "Noah" },
      { id: "demo-3", name: "Ari" }
    ]
  };

  class EventBus {
    constructor() {
      this.events = new Map();
    }

    on(eventName, handler) {
      const listeners = this.events.get(eventName) || new Set();
      listeners.add(handler);
      this.events.set(eventName, listeners);
      return () => listeners.delete(handler);
    }

    emit(eventName, payload) {
      const listeners = this.events.get(eventName);
      if (!listeners) return;
      listeners.forEach((handler) => handler(payload));
    }
  }

  class WebSocketManager {
    constructor({ url, bus }) {
      this.url = url;
      this.bus = bus;
      this.socket = null;
      this.connected = false;
      this.reconnectTimer = null;
      this.reconnectAttempts = 0;
    }

    connect() {
      this.disconnect();
      this.bus.emit("connection:state", { state: "connecting", label: "Connecting" });

      try {
        this.socket = new WebSocket(this.url);
      } catch (error) {
        this.handleFailure(error);
        return;
      }

      this.socket.addEventListener("open", () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.bus.emit("connection:state", { state: "online", label: "Discovering" });
        this.send({ type: "announce", payload: this.getLocalIdentity() });
      });

      this.socket.addEventListener("message", (event) => this.handleMessage(event));
      this.socket.addEventListener("close", () => this.handleClose());
      this.socket.addEventListener("error", (error) => this.handleFailure(error));
    }

    disconnect() {
      window.clearTimeout(this.reconnectTimer);
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
      this.connected = false;
    }

    send(message) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
      this.socket.send(JSON.stringify(message));
      return true;
    }

    handleMessage(event) {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        console.warn("Ignoring malformed signaling message", error);
        return;
      }

      if (message.type === "users") {
        this.bus.emit("users:discovered", message.payload || []);
      }

      if (message.type === "signal") {
        this.bus.emit("webrtc:signal", message.payload);
      }
    }

    handleClose() {
      this.connected = false;
      this.bus.emit("connection:state", { state: "idle", label: "Offline" });
      this.scheduleReconnect();
    }

    handleFailure(error) {
      console.warn("Signaling connection failed", error);
      this.connected = false;
      this.bus.emit("connection:state", { state: "idle", label: "Offline" });
      this.scheduleReconnect();
    }

    scheduleReconnect() {
      window.clearTimeout(this.reconnectTimer);
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 12000);
      this.reconnectAttempts += 1;
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
    }

    getLocalIdentity() {
      const storedId = window.localStorage.getItem("webdrop-device-id");
      const id = storedId || crypto.randomUUID();
      window.localStorage.setItem("webdrop-device-id", id);
      return {
        id,
        name: window.localStorage.getItem("webdrop-name") || "Nearby Device",
        capabilities: ["webrtc-datachannel", "proximity-score"]
      };
    }
  }

  class WebRTCManager {
    constructor({ bus, signal }) {
      this.bus = bus;
      this.signal = signal;
      this.peerConnection = null;
      this.dataChannel = null;
      this.receiveBuffer = [];
      this.receiveMeta = null;
    }

    createPeerConnection(remoteUserId) {
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      this.peerConnection.addEventListener("icecandidate", (event) => {
        if (!event.candidate) return;
        this.bus.emit("network:candidate", {
          userId: remoteUserId,
          candidate: event.candidate.candidate
        });
        this.signal({
          type: "candidate",
          to: remoteUserId,
          candidate: event.candidate
        });
      });

      this.peerConnection.addEventListener("datachannel", (event) => {
        this.attachDataChannel(event.channel);
      });

      this.peerConnection.addEventListener("connectionstatechange", () => {
        this.bus.emit("webrtc:state", this.peerConnection.connectionState);
      });

      return this.peerConnection;
    }

    async createOffer(remoteUserId) {
      const peer = this.createPeerConnection(remoteUserId);
      this.attachDataChannel(peer.createDataChannel("webdrop-files", { ordered: true }));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.signal({ type: "offer", to: remoteUserId, description: peer.localDescription });
    }

    async handleOffer({ from, description }) {
      const peer = this.createPeerConnection(from);
      await peer.setRemoteDescription(description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      this.signal({ type: "answer", to: from, description: peer.localDescription });
    }

    async handleAnswer({ description }) {
      if (!this.peerConnection) return;
      await this.peerConnection.setRemoteDescription(description);
    }

    async handleCandidate({ candidate }) {
      if (!this.peerConnection || !candidate) return;
      await this.peerConnection.addIceCandidate(candidate);
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
        this.bus.emit("transfer:error", "No peer data channel is open yet.");
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
        }
        if (message.type === "file-complete") {
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

  class ProximityEngine {
    constructor({ bus, threshold = CONFIG.proximityThreshold }) {
      this.bus = bus;
      this.threshold = threshold;
      this.audioContext = null;
      this.oscillator = null;
      this.analyser = null;
      this.motionSpikeAt = 0;
      this.tiltAt = 0;
      this.chimeDetectedAt = 0;
      this.networkHints = new Map();
      this.audioReady = false;
      this.listenForMotionSignals();
    }

    async calculateScore(user) {
      const signals = {
        ultrasound: await this.getUltrasoundScore(user).catch(() => 0),
        network: await this.getNetworkHintScore(user).catch(() => 0),
        bump: this.getBumpScore(),
        tilt: this.getTiltScore(),
        chime: await this.getChimeScore(user).catch(() => 0)
      };

      const total = Math.min(100, Object.values(signals).reduce((sum, score) => sum + score, 0));
      const result = { userId: user.id, total, signals, passed: total >= this.threshold };
      this.bus.emit("proximity:score", result);
      return result;
    }

    async getUltrasoundScore() {
      await this.ensureAudioGraph({ requestPermission: false });
      if (!this.analyser) return 0;

      const bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(bins);
      const sampleRate = this.audioContext.sampleRate;
      const hzPerBin = sampleRate / this.analyser.fftSize;
      const startBin = Math.floor(18000 / hzPerBin);
      const endBin = Math.min(bins.length - 1, Math.ceil(20000 / hzPerBin));
      const peak = Math.max(...bins.slice(startBin, endBin + 1));
      return Math.round((peak / 255) * 50);
    }

    async getNetworkHintScore(user) {
      const hint = this.networkHints.get(user.id);
      if (!hint) return 0;
      return hint.sameSubnet ? 20 : 8;
    }

    recordIceCandidate(userId, candidateLine) {
      const ipAddress = this.extractPrivateIpv4(candidateLine);
      if (!ipAddress) return;
      this.networkHints.set(userId, {
        ipAddress,
        sameSubnet: true,
        updatedAt: Date.now()
      });
    }

    getBumpScore() {
      return Date.now() - this.motionSpikeAt < 1800 ? 15 : 0;
    }

    getTiltScore() {
      return Date.now() - this.tiltAt < 2200 ? 15 : 0;
    }

    async getChimeScore() {
      await this.ensureAudioGraph({ requestPermission: false });
      return Date.now() - this.chimeDetectedAt < 3000 ? 20 : 0;
    }

    async startUltrasoundChirp() {
      await this.requestSensorPermissions();
      await this.ensureAudioGraph({ requestPermission: true });
      if (!this.audioContext || this.oscillator) return;

      this.oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      this.oscillator.type = "sine";
      this.oscillator.frequency.value = 19000;
      gain.gain.value = 0.025;
      this.oscillator.connect(gain).connect(this.audioContext.destination);
      this.oscillator.start();
    }

    stopUltrasoundChirp() {
      if (!this.oscillator) return;
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }

    async ensureAudioGraph({ requestPermission = false } = {}) {
      if (this.audioContext && this.analyser) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      if (!requestPermission && !this.audioReady) return;

      this.audioContext = new AudioContextClass();
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 4096;
      source.connect(this.analyser);
      this.audioReady = true;
    }

    async requestSensorPermissions() {
      const requests = [];
      if (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === "function") {
        requests.push(window.DeviceMotionEvent.requestPermission().catch(() => "denied"));
      }
      if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === "function") {
        requests.push(window.DeviceOrientationEvent.requestPermission().catch(() => "denied"));
      }
      await Promise.all(requests);
    }

    listenForMotionSignals() {
      window.addEventListener("devicemotion", (event) => {
        const acceleration = event.accelerationIncludingGravity;
        if (!acceleration) return;
        const force = Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0);
        if (force > 24) {
          this.motionSpikeAt = Date.now();
        }
      });

      window.addEventListener("deviceorientation", (event) => {
        const beta = Math.abs(event.beta || 0);
        const gamma = Math.abs(event.gamma || 0);
        if (beta > 30 || gamma > 30) {
          this.tiltAt = Date.now();
        }
      });
    }

    setNetworkHint(userId, hint) {
      this.networkHints.set(userId, hint);
    }

    extractPrivateIpv4(candidateLine) {
      const match = String(candidateLine).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      if (!match) return null;
      const ipAddress = match[0];
      return this.isPrivateIpv4(ipAddress) ? ipAddress : null;
    }

    isPrivateIpv4(ipAddress) {
      const parts = ipAddress.split(".").map(Number);
      if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      return parts[0] === 192 && parts[1] === 168;
    }
  }

  class WebDropApp {
    constructor() {
      this.bus = new EventBus();
      this.users = new Map();
      this.selectedFiles = [];
      this.elements = {
        connectionChip: document.getElementById("connectionChip"),
        connectionText: document.getElementById("connectionText"),
        connectButton: document.getElementById("connectButton"),
        soundButton: document.getElementById("soundButton"),
        usersLayer: document.getElementById("usersLayer"),
        emptySearch: document.getElementById("emptySearch"),
        dropZone: document.getElementById("dropZone"),
        transferTitle: document.getElementById("transferTitle"),
        fileInput: document.getElementById("fileInput"),
        dropZoneMeta: document.getElementById("dropZoneMeta"),
        fileSummary: document.getElementById("fileSummary"),
        scoreSummary: document.getElementById("scoreSummary"),
        progressBar: document.getElementById("progressBar"),
        particleField: document.getElementById("particleField"),
        statusNote: document.getElementById("statusNote")
      };

      this.websocket = new WebSocketManager({ url: CONFIG.signalingUrl, bus: this.bus });
      this.webrtc = new WebRTCManager({
        bus: this.bus,
        signal: (payload) => this.websocket.send({ type: "signal", payload })
      });
      this.proximity = new ProximityEngine({ bus: this.bus });
    }

    init() {
      this.bindDomEvents();
      this.bindBusEvents();
      this.renderUsers(CONFIG.demoUsers);
      window.setInterval(() => this.updateProximityScores(), 1800);
    }

    bindDomEvents() {
      this.elements.connectButton.addEventListener("click", () => this.websocket.connect());
      this.elements.soundButton.addEventListener("pointerdown", () => {
        this.proximity.startUltrasoundChirp()
          .then(() => this.setStatus("Proximity audio is primed for nearby-device scoring."))
          .catch(() => this.setStatus("Microphone permission is needed for ultrasound proximity scoring."));
      });
      this.elements.soundButton.addEventListener("pointerup", () => this.proximity.stopUltrasoundChirp());
      this.elements.soundButton.addEventListener("pointercancel", () => this.proximity.stopUltrasoundChirp());
      this.elements.fileInput.addEventListener("change", (event) => this.handleFiles(event.target.files));

      ["dragenter", "dragover"].forEach((eventName) => {
        this.elements.dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          this.elements.dropZone.classList.add("is-dragover");
        });
      });

      ["dragleave", "drop"].forEach((eventName) => {
        this.elements.dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          this.elements.dropZone.classList.remove("is-dragover");
        });
      });

      this.elements.dropZone.addEventListener("drop", (event) => {
        this.handleFiles(event.dataTransfer.files);
      });
    }

    bindBusEvents() {
      this.bus.on("connection:state", ({ state, label }) => {
        this.elements.connectionChip.dataset.state = state;
        this.elements.connectionText.textContent = label;
      });

      this.bus.on("users:discovered", (users) => this.renderUsers(users));
      this.bus.on("proximity:score", (score) => this.applyScoreToUser(score));
      this.bus.on("transfer:ready", () => this.sendSelectedFiles());
      this.bus.on("transfer:start", () => this.setTransferActive(true));
      this.bus.on("transfer:progress", (progress) => this.updateProgress(progress));
      this.bus.on("transfer:complete", (result) => this.completeTransfer(result));
      this.bus.on("transfer:error", (message) => this.setStatus(message));
      this.bus.on("network:candidate", ({ userId, candidate }) => this.proximity.recordIceCandidate(userId, candidate));

      this.bus.on("webrtc:signal", async (payload) => {
        if (!payload) return;
        if (payload.type === "offer") await this.webrtc.handleOffer(payload);
        if (payload.type === "answer") await this.webrtc.handleAnswer(payload);
        if (payload.type === "candidate") await this.webrtc.handleCandidate(payload);
      });
    }

    renderUsers(users) {
      users.forEach((user, index) => {
        const normalizedUser = { id: user.id, name: user.name || "Nearby Device", score: user.score || 0 };
        this.users.set(normalizedUser.id, normalizedUser);

        let pill = this.elements.usersLayer.querySelector(`[data-user-id="${normalizedUser.id}"]`);
        if (!pill) {
          pill = this.createUserPill(normalizedUser);
          this.elements.usersLayer.appendChild(pill);
        }

        this.positionUserPill(pill, index, normalizedUser.score);
      });

      this.elements.emptySearch.classList.toggle("is-hidden", this.users.size > 0);
    }

    createUserPill(user) {
      const pill = document.createElement("article");
      pill.className = "user-pill";
      pill.dataset.userId = user.id;
      pill.innerHTML = `
        <span class="user-avatar" aria-hidden="true">${this.getInitials(user.name)}</span>
        <span class="user-name">${this.escapeText(user.name)}</span>
        <button class="user-close" type="button" aria-label="Dismiss ${this.escapeText(user.name)}">&times;</button>
      `;

      pill.addEventListener("click", () => this.selectUser(user.id));
      pill.querySelector("button").addEventListener("click", (event) => {
        event.stopPropagation();
        this.users.delete(user.id);
        pill.remove();
        this.elements.emptySearch.classList.toggle("is-hidden", this.users.size > 0);
      });

      return pill;
    }

    positionUserPill(pill, index, score) {
      const angle = (index / Math.max(this.users.size, 1)) * Math.PI * 2 - Math.PI / 2;
      const isCompact = window.matchMedia("(max-width: 380px)").matches;
      const radiusX = Math.max(isCompact ? 106 : 122, (isCompact ? 156 : 172) - score * 1.05);
      const radiusY = Math.max(isCompact ? 54 : 62, (isCompact ? 84 : 98) - score * 0.55);
      const x = Math.cos(angle) * radiusX;
      const y = Math.sin(angle) * radiusY;
      pill.style.setProperty("--pill-x", `calc(-50% + ${x}px)`);
      pill.style.setProperty("--pill-y", `calc(-50% + ${y}px)`);
    }

    async updateProximityScores() {
      const users = Array.from(this.users.values());
      for (const user of users) {
        const score = await this.proximity.calculateScore(user);
        user.score = score.total;
      }
    }

    applyScoreToUser(score) {
      const pill = this.elements.usersLayer.querySelector(`[data-user-id="${score.userId}"]`);
      const user = this.users.get(score.userId);
      if (!pill || !user) return;

      user.score = score.total;
      const users = Array.from(this.users.values());
      this.positionUserPill(pill, users.findIndex((item) => item.id === score.userId), score.total);
      pill.classList.toggle("is-targeted", score.passed);

      const nearest = users.reduce((best, item) => (item.score > best.score ? item : best), { score: 0 });
      this.elements.scoreSummary.textContent = `${Math.round(nearest.score)} pts`;
      if (score.passed) {
        this.setStatus(`${user.name} is close enough for a direct WebRTC handoff.`);
      }
    }

    selectUser(userId) {
      const user = this.users.get(userId);
      if (!user) return;
      this.setStatus(`Preparing peer channel for ${user.name}.`);
      this.webrtc.createOffer(userId).catch((error) => this.setStatus(error.message));
    }

    handleFiles(fileList) {
      this.selectedFiles = Array.from(fileList || []);
      if (!this.selectedFiles.length) return;

      const totalBytes = this.selectedFiles.reduce((sum, file) => sum + file.size, 0);
      this.elements.transferTitle.textContent = "Ready to send";
      this.elements.fileSummary.textContent = `${this.selectedFiles.length} file${this.selectedFiles.length === 1 ? "" : "s"} - ${this.formatBytes(totalBytes)}`;
      this.elements.dropZoneMeta.textContent = this.selectedFiles.map((file) => file.name).join(", ");
      this.setStatus("Choose a nearby user pill to send the selected file.");
    }

    async sendSelectedFiles() {
      if (!this.selectedFiles.length) {
        this.setStatus("Peer channel is ready. Drop a file to send it.");
        return;
      }

      for (const file of this.selectedFiles) {
        await this.webrtc.sendFile(file);
      }
    }

    setTransferActive(isActive) {
      this.elements.particleField.classList.toggle("is-active", isActive);
      this.elements.dropZone.classList.toggle("is-processing", isActive);
      this.elements.transferTitle.textContent = isActive ? "Transferring" : "Ready to receive";
      this.updateProgress(0);
    }

    updateProgress(progress) {
      this.elements.progressBar.style.width = `${progress}%`;
    }

    completeTransfer(result) {
      this.setTransferActive(false);
      this.updateProgress(100);
      this.elements.transferTitle.textContent = result.direction === "sent" ? "Sent" : "Received";
      if (result.direction === "received" && result.blob) {
        this.offerDownload(result.blob, result.meta && result.meta.name);
      }
      this.setStatus(result.direction === "sent" ? "File sent over WebRTC data channel." : "File received and ready to save.");
    }

    offerDownload(blob, name = "webdrop-file") {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    setStatus(message) {
      this.elements.statusNote.textContent = message;
    }

    getInitials(name) {
      return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
    }

    escapeText(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
      }[char]));
    }

    formatBytes(bytes) {
      if (!bytes) return "0 B";
      const units = ["B", "KB", "MB", "GB"];
      const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
    }
  }

  function bootstrap() {
    const app = new WebDropApp();
    app.init();
    window.WebDrop = app;
  }

  if (window.cordova) {
    document.addEventListener("deviceready", bootstrap, { once: true });
  } else {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  }
}());

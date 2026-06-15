import { WebSocket, WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { TokenBucket } from "./rate-limits.js";
import {
  ProtocolError,
  parseJsonMessage,
  publicPeer,
  validateClientHello,
  validateRoutedMessage
} from "./message-schema.js";

const PROTECTED_TYPES = new Set([
  "proximity:ready",
  "proximity:telemetry",
  "proximity:fallback",
  "rtc:signal",
  "rtc:path-metric",
  "chat:message",
  "transfer:manifest",
  "transfer:control",
  "peer:disconnect"
]);
const PROXIMITY_GATED_TYPES = new Set([
  "rtc:signal",
  "rtc:path-metric",
  "chat:message",
  "transfer:manifest",
  "transfer:control"
]);

export class SignalingHub {
  constructor({ server, path = "/ws", logger, maxJsonBytes = 65536, heartbeatIntervalMs = 25000, sessionTtlMs = 900000, pairingTtlMs = 120000, proximityAnalyzer, qrTokenProvider, metrics } = {}) {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: maxJsonBytes * 4
    });
    this.path = path;
    this.logger = logger;
    this.maxJsonBytes = maxJsonBytes;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.sessionTtlMs = sessionTtlMs;
    this.pairingTtlMs = pairingTtlMs;
    this.proximityAnalyzer = proximityAnalyzer;
    this.qrTokenProvider = qrTokenProvider;
    this.metrics = metrics;
    this.clients = new Map();
    this.pendingInvites = new Map();
    this.activePairs = new Map();
    this.proximityDecisions = new Map();
    this.proximityReady = new Map();
    this.socketToClient = new WeakMap();
    this.rateLimits = new TokenBucket({ capacity: 90, refillPerSecond: 30 });
    this.ipRateLimits = new TokenBucket({ capacity: 120, refillPerSecond: 20 });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname !== this.path) return;
      if (!this.isAllowedOrigin(request.headers.origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request);
      });
    });

    this.wss.on("connection", (socket, request) => this.handleConnection(socket, request));
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }

  setAllowedOrigins(origins) {
    this.allowedOrigins = new Set((origins || []).filter(Boolean));
  }

  isAllowedOrigin(origin) {
    if (!this.allowedOrigins?.size) return true;
    if (!origin) return false;
    return this.allowedOrigins.has(origin);
  }

  handleConnection(socket, request) {
    socket.isAlive = true;
    socket.ip = request.headers["x-real-ip"] || request.socket.remoteAddress;
    socket.on("pong", () => {
      socket.isAlive = true;
      const client = this.socketToClient.get(socket);
      if (client) {
        client.lastSeenAt = Date.now();
        if (client.pairingId) this.touchPair(client.pairingId);
      }
    });
    socket.on("message", (data, isBinary) => this.handleMessage(socket, data, isBinary));
    socket.on("close", () => this.removeClient(socket, "socket_closed"));
    socket.on("error", (error) => {
      this.logger?.warn("WebSocket error.", { message: error.message });
      this.removeClient(socket, "socket_error");
    });
    this.send(socket, "server:ready", {
      message: "Send client:hello to join WebDrop signaling.",
      maxJsonBytes: this.maxJsonBytes
    });
  }

  handleMessage(socket, data, isBinary) {
    try {
      if (isBinary) {
        throw new ProtocolError("binary_not_allowed", "Binary WebSocket frames are not allowed. Use RTCDataChannel for file chunks.");
      }
      if (!this.ipRateLimits.take(socket.ip || "unknown")) {
        throw new ProtocolError("rate_limited", "Too many signaling messages from this address.");
      }
      const raw = data.toString("utf8");
      const message = parseJsonMessage(raw, this.maxJsonBytes);
      const client = this.socketToClient.get(socket);

      if (!client) {
        const hello = validateClientHello(message);
        this.registerClient(socket, hello);
        return;
      }

      if (!this.rateLimits.take(client.id)) {
        throw new ProtocolError("rate_limited", "Too many signaling messages.");
      }

      if (message.type === "client:ping") {
        client.lastSeenAt = Date.now();
        if (client.pairingId) this.touchPair(client.pairingId);
        this.send(socket, "server:pong", { now: new Date().toISOString() });
        return;
      }

      const routed = validateRoutedMessage(message);
      this.metrics?.recordEvent(routed.type);
      this.route(client, routed);
    } catch (error) {
      this.handleProtocolError(socket, error);
    }
  }

  registerClient(socket, hello) {
    const existing = this.clients.get(hello.id);
    if (existing) {
      this.send(existing.socket, "server:replaced", { reason: "A newer connection joined with this client id." });
      existing.socket.close(4000, "replaced");
      this.clients.delete(hello.id);
    }

    const client = {
      ...hello,
      socket,
      sessionId: makeSessionId(hello.id),
      turnAccessToken: randomUUID(),
      joinedAt: new Date().toISOString(),
      lastSeenAt: Date.now(),
      pairingId: null
    };
    this.clients.set(client.id, client);
    this.socketToClient.set(socket, client);
    this.send(socket, "connected", {
      mode: "wss",
      id: client.id,
      sessionId: client.sessionId,
      turnAccessToken: client.turnAccessToken
    });
    this.send(socket, "peers", this.peerList(client.id));
    this.broadcast("peers", this.peerList(), { exceptId: client.id });
    this.logger?.info("Client joined signaling.", { id: client.id, deviceName: client.deviceName });
  }

  route(sender, message) {
    const target = this.clients.get(message.targetId);
    if (!target) {
      this.send(sender.socket, "route:error", {
        code: "target_offline",
        targetId: message.targetId,
        type: message.type
      });
      return;
    }

    if (message.type === "invite") {
      this.createPendingInvite(sender, target, message);
      return;
    }

    if (message.type === "invite:accept") {
      this.acceptInvite(sender, target, message);
      return;
    }

    if (message.type === "invite:reject") {
      this.rejectInvite(sender, target, message);
      return;
    }

    if (message.type === "proximity:qr:issue") {
      this.issueQrToken(sender, target, message);
      return;
    }

    if (message.type === "proximity:qr:verify") {
      this.verifyQrToken(sender, target, message);
      return;
    }

    if (PROTECTED_TYPES.has(message.type) && !this.arePaired(sender, target, message.pairingId)) {
      this.send(sender.socket, "route:error", {
        code: "pair_required",
        targetId: target.id,
        type: message.type
      });
      return;
    }
    if (message.type === "proximity:ready") {
      this.markProximityReady(sender, target, message.pairingId || sender.pairingId);
      return;
    }
    if (PROXIMITY_GATED_TYPES.has(message.type) && this.proximityAnalyzer?.enabled && !this.isProximityVerified(message.pairingId || sender.pairingId)) {
      this.send(sender.socket, "route:error", {
        code: "proximity_not_verified",
        targetId: target.id,
        type: message.type
      });
      return;
    }

    const pairingId = message.pairingId || sender.pairingId;
    const payload = {
      ...message,
      pairingId,
      fromId: sender.id,
      from: publicPeer(sender),
      receivedAt: new Date().toISOString()
    };
    if (message.type === "proximity:telemetry" && this.proximityAnalyzer) {
      payload.analysis = this.proximityAnalyzer.enabled
        ? this.proximityAnalyzer.analyze(message.metrics || message.payload || {})
        : {
          ...this.proximityAnalyzer.policy(),
          decision: "not_enforced"
        };
      this.recordProximityDecision(pairingId, sender.id, payload.analysis);
      const decision = {
        pairingId,
        analysis: payload.analysis,
        pairVerified: this.isProximityVerified(pairingId)
      };
      this.send(sender.socket, "proximity:decision", decision);
      this.send(target.socket, "proximity:decision", decision);
    }
    if (message.type === "rtc:path-metric") {
      this.metrics?.recordPathMetric(message.payload?.path);
    }
    delete payload.targetId;
    this.send(target.socket, message.type, payload);

    if (message.type === "peer:disconnect") {
      this.clearPair(pairingId);
      this.send(sender.socket, "peer:disconnected", { peerId: target.id, pairingId });
      this.send(target.socket, "peer:disconnected", { peerId: sender.id, pairingId });
      this.broadcast("peers", this.peerList());
    }
  }

  issueQrToken(sender, target, message) {
    const pairingId = message.pairingId || sender.pairingId || this.findPendingPairingId(sender.id, target.id);
    if (!this.canUsePairing(sender, target, pairingId)) {
      this.send(sender.socket, "route:error", {
        code: "pairing_not_available",
        targetId: target.id,
        type: message.type
      });
      return;
    }
    const issued = this.qrTokenProvider?.issue({
      pairingId,
      issuerId: sender.id,
      targetId: target.id
    });
    this.send(sender.socket, "proximity:qr:issued", issued);
  }

  verifyQrToken(sender, target, message) {
    const pairingId = message.pairingId || sender.pairingId || this.findPendingPairingId(sender.id, target.id);
    if (!this.canUsePairing(sender, target, pairingId)) {
      this.send(sender.socket, "route:error", {
        code: "pairing_not_available",
        targetId: target.id,
        type: message.type
      });
      return;
    }
    const result = this.qrTokenProvider?.verify({
      token: message.payload.token,
      pairingId,
      verifierId: sender.id,
      targetId: target.id
    }) || { valid: false, pairingId, verifiedAt: null };
    this.send(sender.socket, "proximity:qr:verified", result);
    if (result.valid) this.send(target.socket, "proximity:qr:verified", result);
    if (result.valid) {
      this.proximityDecisions.set(pairingId, new Map([
        [sender.id, "verified"],
        [target.id, "verified"]
      ]));
    }
  }

  canUsePairing(sender, target, pairingId) {
    if (this.arePaired(sender, target, pairingId)) return true;
    const pending = this.pendingInvites.get(pairingId);
    return Boolean(
      pending &&
      ((pending.fromId === sender.id && pending.toId === target.id) ||
        (pending.fromId === target.id && pending.toId === sender.id))
    );
  }

  findPendingPairingId(a, b) {
    for (const [pairingId, pending] of this.pendingInvites) {
      if ((pending.fromId === a && pending.toId === b) || (pending.fromId === b && pending.toId === a)) {
        return pairingId;
      }
    }
    return null;
  }

  createPendingInvite(sender, target, message) {
    if (sender.pairingId || target.pairingId) {
      this.send(sender.socket, "route:error", {
        code: "peer_busy",
        targetId: target.id,
        type: message.type
      });
      return;
    }
    const pairingId = makePairingId(sender.id, target.id);
    this.pendingInvites.set(pairingId, {
      pairingId,
      fromId: sender.id,
      toId: target.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.pairingTtlMs
    });
    this.send(target.socket, message.type, {
      ...message,
      pairingId,
      fromId: sender.id,
      from: publicPeer(sender),
      receivedAt: new Date().toISOString()
    });
  }

  acceptInvite(sender, target, message) {
    const pairingId = message.pairingId || this.findPendingPairingId(sender.id, target.id);
    const pending = this.pendingInvites.get(pairingId);
    if (!pending || pending.expiresAt <= Date.now() || pending.fromId !== target.id || pending.toId !== sender.id) {
      this.pendingInvites.delete(pairingId);
      this.send(sender.socket, "route:error", {
        code: "invite_not_pending",
        targetId: target.id,
        type: message.type
      });
      return;
    }
    if (sender.pairingId || target.pairingId) {
      this.send(sender.socket, "route:error", {
        code: "peer_busy",
        targetId: target.id,
        type: message.type
      });
      return;
    }
    this.pendingInvites.delete(pairingId);
    const activePair = new Set([sender.id, target.id]);
    activePair.expiresAt = Date.now() + this.sessionTtlMs;
    this.activePairs.set(pairingId, activePair);
    sender.pairingId = pairingId;
    target.pairingId = pairingId;
    this.send(target.socket, message.type, {
      ...message,
      pairingId,
      fromId: sender.id,
      from: publicPeer(sender),
      receivedAt: new Date().toISOString()
    });
    this.send(sender.socket, message.type, {
      pairingId,
      fromId: target.id,
      from: publicPeer(target),
      receivedAt: new Date().toISOString()
    });
    this.broadcast("peers", this.peerList());
  }

  rejectInvite(sender, target, message) {
    const pairingId = message.pairingId || this.findPendingPairingId(sender.id, target.id);
    this.pendingInvites.delete(pairingId);
    this.send(target.socket, message.type, {
      ...message,
      pairingId,
      fromId: sender.id,
      from: publicPeer(sender),
      receivedAt: new Date().toISOString()
    });
    this.broadcast("peers", this.peerList());
  }

  arePaired(sender, target, pairingId) {
    const activePairingId = pairingId || sender.pairingId;
    if (!activePairingId || sender.pairingId !== activePairingId || target.pairingId !== activePairingId) return false;
    const pair = this.activePairs.get(activePairingId);
    if (!pair || pair.expiresAt <= Date.now()) {
      this.clearPair(activePairingId);
      return false;
    }
    if (!pair.has(sender.id) || !pair.has(target.id)) return false;
    this.touchPair(activePairingId);
    return true;
  }

  touchPair(pairingId) {
    const pair = this.activePairs.get(pairingId);
    if (pair) pair.expiresAt = Date.now() + this.sessionTtlMs;
  }

  authenticateTurnRequest(token, clientId) {
    if (!token) return null;
    for (const client of this.clients.values()) {
      if (client.turnAccessToken !== token) continue;
      if (clientId && client.id !== clientId) return null;
      client.lastSeenAt = Date.now();
      if (client.pairingId) this.touchPair(client.pairingId);
      return client;
    }
    return null;
  }

  clearPair(pairingId) {
    const pair = this.activePairs.get(pairingId);
    if (pair) {
      for (const id of pair) {
        const client = this.clients.get(id);
        if (client?.pairingId === pairingId) client.pairingId = null;
      }
      this.activePairs.delete(pairingId);
      this.proximityDecisions.delete(pairingId);
      this.proximityReady.delete(pairingId);
    }
    for (const [pendingId, pending] of this.pendingInvites) {
      if (pendingId === pairingId || pair?.has(pending.fromId) || pair?.has(pending.toId)) {
        this.pendingInvites.delete(pendingId);
      }
    }
  }

  recordProximityDecision(pairingId, clientId, analysis) {
    if (!pairingId || !analysis) return;
    const decisions = this.proximityDecisions.get(pairingId) || new Map();
    decisions.set(clientId, analysis.decision);
    this.proximityDecisions.set(pairingId, decisions);
  }

  markProximityReady(sender, target, pairingId) {
    const ready = this.proximityReady.get(pairingId) || new Set();
    if (ready.started) return;
    ready.add(sender.id);
    this.proximityReady.set(pairingId, ready);
    if (!ready.has(target.id)) return;
    const payload = {
      pairingId,
      startAt: Date.now() + 1200,
      durationMs: 3000
    };
    ready.started = true;
    this.send(sender.socket, "proximity:start", payload);
    this.send(target.socket, "proximity:start", payload);
  }

  isProximityVerified(pairingId) {
    if (!this.proximityAnalyzer?.enabled) return true;
    const pair = this.activePairs.get(pairingId);
    const decisions = this.proximityDecisions.get(pairingId);
    return Boolean(
      pair &&
      decisions &&
      [...pair].every((id) => decisions.get(id) === "verified")
    );
  }

  peerList(exceptId) {
    return Array.from(this.clients.values())
      .filter((client) => client.id !== exceptId)
      .map(publicPeer);
  }

  broadcast(type, payload, { exceptId } = {}) {
    for (const client of this.clients.values()) {
      if (client.id !== exceptId) this.send(client.socket, type, payload);
    }
  }

  removeClient(socket, reason) {
    const client = this.socketToClient.get(socket);
    if (!client) return;
    if (this.clients.get(client.id) !== client) {
      this.socketToClient.delete(socket);
      return;
    }
    this.clients.delete(client.id);
    this.socketToClient.delete(socket);
    this.logger?.info("Client left signaling.", { id: client.id, reason });
    if (client.pairingId) {
      const pairingId = client.pairingId;
      const pair = this.activePairs.get(pairingId);
      const partnerIds = pair ? [...pair].filter((id) => id !== client.id) : [];
      this.clearPair(pairingId);
      for (const partnerId of partnerIds) {
        const peer = this.clients.get(partnerId);
        if (peer) this.send(peer.socket, "peer:disconnected", { peerId: client.id, pairingId });
      }
    }
    for (const [pairingId, pending] of this.pendingInvites) {
      if (pending.fromId === client.id || pending.toId === client.id) this.pendingInvites.delete(pairingId);
    }
    this.broadcast("peers", this.peerList());
  }

  heartbeat() {
    const now = Date.now();
    this.rateLimits.sweep();
    this.ipRateLimits.sweep();
    for (const [pairingId, pending] of this.pendingInvites) {
      if (pending.expiresAt <= now) this.pendingInvites.delete(pairingId);
    }
    for (const [pairingId, pair] of this.activePairs) {
      if (pair.expiresAt > now) continue;
      const peerIds = [...pair];
      this.clearPair(pairingId);
      for (const peerId of peerIds) {
        const peer = this.clients.get(peerId);
        if (peer) this.send(peer.socket, "peer:disconnected", { pairingId, reason: "pairing_expired" });
      }
    }
    for (const client of this.clients.values()) {
      if (now - client.lastSeenAt > this.sessionTtlMs && !client.socket.isAlive) {
        client.socket.terminate();
        this.removeClient(client.socket, "heartbeat_timeout");
        continue;
      }
      if (!client.socket.isAlive) {
        client.socket.terminate();
        this.removeClient(client.socket, "missed_pong");
        continue;
      }
      client.socket.isAlive = false;
      client.socket.ping();
    }
  }

  send(socket, type, payload) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type, payload }));
  }

  handleProtocolError(socket, error) {
    if (error instanceof ProtocolError) {
      this.send(socket, "protocol:error", {
        code: error.code,
        message: error.message
      });
      if (["binary_not_allowed", "message_too_large", "hello_required"].includes(error.code)) {
        socket.close(1008, error.code);
      }
      return;
    }
    this.logger?.error("Unexpected signaling error.", { message: error.message });
    this.send(socket, "protocol:error", {
      code: "internal_error",
      message: "Internal signaling error."
    });
  }

  close() {
    clearInterval(this.heartbeatTimer);
    for (const client of this.clients.values()) client.socket.close();
    this.wss.close();
  }
}

function makePairingId(a, b) {
  return `pair-${randomUUID()}-${[a, b].sort().join("-").slice(0, 80)}`;
}

function makeSessionId(id) {
  return `session-${randomUUID()}-${id.slice(0, 40)}`;
}

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
// Ceremony timing defaults. Each is overridable per-instance (env-tunable via
// server.js) so the operator can adjust caps and intervals live. They are
// DEFAULTS only; the hub reads the resolved values from instance fields.
const DEFAULT_SESSION_JOIN_WINDOW_MS = 1800;
const DEFAULT_SESSION_START_DELAY_MS = 1200;
const DEFAULT_SESSION_DURATION_MS = 3600;
const DEFAULT_PROXIMITY_SESSION_TTL_MS = 15000;
const DEFAULT_SESSION_MATCH_SLOP_MS = 4000;
const SESSION_SCORE_MINIMUM = 0.55;

// Acoustic ceremony slot floor. A single coded ultrasonic chirp needs roughly
// this much airtime to be correlated reliably. These MUST stay in sync with the
// client scheduler in js/services/proximity-engine.js
// (ACOUSTIC_MIN_SLOT_MS + ACOUSTIC_SLOT_GUARD_MS). The per-session acoustic
// cohort is bounded so that, inside the ceremony window, every time slot stays
// at or above this floor — the system NEVER schedules sub-floor slots; instead
// it clamps cohort size and opens additional concurrent sessions.
const ACOUSTIC_MIN_SLOT_MS = 520;
const ACOUSTIC_SLOT_GUARD_MS = 80;
const ACOUSTIC_CEREMONY_SLOT_FLOOR_MS = ACOUSTIC_MIN_SLOT_MS + ACOUSTIC_SLOT_GUARD_MS; // 600ms

// Capacity defaults. The per-session cohort default is derived from the slot
// floor below (clamped in the constructor); the global cap defaults to 100 for
// the physical test and is the only knob that needs raising toward 10,000 (the
// data structures already support many concurrent small cohorts — see README
// "10,000-user readiness" for the Redis/shared-presence multi-node path).
const DEFAULT_MAX_TOTAL_PROXIMITY_PARTICIPANTS = 100;

// Defensive cap on how many per-peer acoustic detections we retain/echo. It is
// bounded by the cohort but kept as its own constant so detection plumbing does
// not silently change when the cohort cap is tuned.
const MAX_ACOUSTIC_DETECTIONS = 8;

const ACOUSTIC_BAND_START_HZ = 18_600;
const ACOUSTIC_BAND_END_HZ = 19_400;
const ACOUSTIC_MIN_BANDWIDTH_HZ = 420;

// Cross-session acoustic de-confliction knobs (all env-tunable). With the
// default 18.6-19.4 kHz band only one >=420 Hz sub-band fits, so sub-band
// splitting is a no-op until the band is widened via ACOUSTIC_BAND_END_HZ; the
// start stagger spreads concurrent cohorts across a few time phases so cohorts
// that fill at the same instant do not all begin chirping simultaneously.
const DEFAULT_ACOUSTIC_SESSION_STAGGER_MS = 600;
const DEFAULT_ACOUSTIC_SESSION_STAGGER_PHASES = 3;
const DEFAULT_ACOUSTIC_MAX_CONCURRENT_SUBBANDS = 4;
// Minimum separation (correlation units, 0..1) the strongest heard signature must
// hold over the runner-up before a reciprocal pair is trusted. Tuning knob for
// physical devices: raise to reject ambiguous/crowded rooms more aggressively,
// lower to ease legitimate pairing. A device that never reports a margin fails
// this check rather than passing it (see hasSufficientWinnerMargin).
const ACOUSTIC_WINNER_MARGIN = 0.04;
const ACOUSTIC_MIN_CORRELATION = 0.3;
const ACOUSTIC_SLOT_CORRELATION_MIN = 0.2;
const ACOUSTIC_PACKET_CONSENSUS_MIN_CORRELATION = 0.05;
const ACOUSTIC_PACKET_CONSENSUS_MIN_COUNT = 3;
const ACOUSTIC_ENERGY_ASSISTED_MIN_CORRELATION = 0.16;
const ACOUSTIC_ENERGY_ASSISTED_MIN_MARGIN_DB = 4.5;
const DETAILED_METRIC_TYPES = new Set([
  "admin:monitor:telemetry",
  "proximity:session:telemetry",
  "proximity:session:diagnostic"
]);

export class SignalingHub {
  constructor({
    server,
    path = "/ws",
    logger,
    maxJsonBytes = 131072,
    heartbeatIntervalMs = 25000,
    sessionTtlMs = 900000,
    pairingTtlMs = 120000,
    proximityAnalyzer,
    qrTokenProvider,
    metrics,
    maxProximitySessionClients,
    maxTotalProximityParticipants,
    proximitySessionJoinWindowMs,
    proximitySessionStartDelayMs,
    proximitySessionDurationMs,
    proximitySessionTtlMs,
    proximitySessionMatchSlopMs,
    acousticBandStartHz,
    acousticBandEndHz,
    acousticMinBandwidthHz,
    acousticSessionStaggerMs,
    acousticSessionStaggerPhases,
    acousticMaxConcurrentSubBands
  } = {}) {
    this.wss = new WebSocketServer({
      noServer: true,
      // Enforce the JSON size cap at the protocol layer so oversized or binary
      // frames are rejected by ws before they are buffered/stringified, instead
      // of allowing several times the documented limit through to the app check.
      maxPayload: maxJsonBytes
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
    this.turnTokens = new Map();
    this.pendingInvites = new Map();
    this.activePairs = new Map();
    this.proximityDecisions = new Map();
    this.proximityReady = new Map();
    this.proximitySessions = new Map();
    this.adminMonitors = new Map();
    // Multiple sessions can be open (accepting joiners) at once. New joiners are
    // routed into any open cohort that still has room; when none has room a new
    // concurrent cohort is opened (subject to the global participant cap).
    this.openProximitySessionIds = new Set();
    // Monotonic counters used to spread concurrent cohorts across stagger time
    // phases and acoustic sub-bands. Modulo arithmetic keeps them bounded.
    this.proximityStartCounter = 0;
    this.proximityBandCounter = 0;
    this.socketToClient = new WeakMap();

    // Resolve env-tunable ceremony timings (caps + intervals adjustable live).
    this.proximityJoinWindowMs = configuredPositive(proximitySessionJoinWindowMs, DEFAULT_SESSION_JOIN_WINDOW_MS);
    this.proximityStartDelayMs = configuredPositive(proximitySessionStartDelayMs, DEFAULT_SESSION_START_DELAY_MS);
    this.proximityDurationMs = configuredPositive(proximitySessionDurationMs, DEFAULT_SESSION_DURATION_MS);
    this.proximitySessionTtlMs = configuredPositive(proximitySessionTtlMs, DEFAULT_PROXIMITY_SESSION_TTL_MS);
    this.proximityMatchSlopMs = configuredPositive(proximitySessionMatchSlopMs, DEFAULT_SESSION_MATCH_SLOP_MS);

    // The cohort ceiling is the largest number of time slots that still keep
    // every slot at/above the acoustic floor inside the ceremony window. The
    // requested per-session cap is clamped to this ceiling so a misconfiguration
    // can never schedule sub-floor slots. Raising the cohort requires extending
    // the ceremony window (proximitySessionDurationMs), not just the cap.
    this.proximityCohortCeiling = Math.max(2, Math.floor(this.proximityDurationMs / ACOUSTIC_CEREMONY_SLOT_FLOOR_MS));
    const requestedCohort = configuredPositive(maxProximitySessionClients, this.proximityCohortCeiling);
    this.maxProximitySessionClients = Math.max(2, Math.min(this.proximityCohortCeiling, Math.floor(requestedCohort)));
    if (Math.floor(requestedCohort) > this.proximityCohortCeiling) {
      this.logger?.warn("Clamping per-session acoustic cohort to the slot-floor ceiling.", {
        requested: Math.floor(requestedCohort),
        ceiling: this.proximityCohortCeiling,
        ceremonyWindowMs: this.proximityDurationMs,
        slotFloorMs: ACOUSTIC_CEREMONY_SLOT_FLOOR_MS
      });
    }
    this.maxTotalProximityParticipants = configuredPositive(maxTotalProximityParticipants, DEFAULT_MAX_TOTAL_PROXIMITY_PARTICIPANTS);

    // Acoustic band + cross-session de-confliction knobs.
    this.acousticBandStartHz = configuredPositive(acousticBandStartHz, ACOUSTIC_BAND_START_HZ);
    this.acousticBandEndHz = Math.max(this.acousticBandStartHz + 1, configuredPositive(acousticBandEndHz, ACOUSTIC_BAND_END_HZ));
    this.acousticMinBandwidthHz = configuredPositive(acousticMinBandwidthHz, ACOUSTIC_MIN_BANDWIDTH_HZ);
    this.acousticSessionStaggerMs = configuredNonNegative(acousticSessionStaggerMs, DEFAULT_ACOUSTIC_SESSION_STAGGER_MS);
    this.acousticSessionStaggerPhases = Math.max(1, Math.floor(configuredPositive(acousticSessionStaggerPhases, DEFAULT_ACOUSTIC_SESSION_STAGGER_PHASES)));
    this.acousticMaxConcurrentSubBands = Math.max(1, Math.floor(configuredPositive(acousticMaxConcurrentSubBands, DEFAULT_ACOUSTIC_MAX_CONCURRENT_SUBBANDS)));
    this.rateLimits = new TokenBucket({ capacity: 90, refillPerSecond: 30 });
    this.ipRateLimits = new TokenBucket({ capacity: 120, refillPerSecond: 20 });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname !== this.path) {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
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
      if (!DETAILED_METRIC_TYPES.has(routed.type)) this.metrics?.recordEvent(routed.type);
      this.route(client, routed);
    } catch (error) {
      this.handleProtocolError(socket, error);
    }
  }

  registerClient(socket, hello) {
    const existing = this.clients.get(hello.id);
    if (existing && ![WebSocket.CLOSING, WebSocket.CLOSED].includes(existing.socket.readyState)) {
      this.logger?.warn("Replacing stale signaling session with the same client id.", { id: hello.id });
      this.removeClient(existing.socket, "replaced_by_new_connection");
      existing.socket.close(4001, "replaced_by_new_connection");
    }
    for (const candidate of this.clients.values()) {
      if (
        candidate.id !== hello.id
        && candidate.deviceId
        && hello.deviceId
        && candidate.deviceId === hello.deviceId
        && ![WebSocket.CLOSING, WebSocket.CLOSED].includes(candidate.socket.readyState)
      ) {
        this.logger?.warn("Replacing stale signaling session with the same physical device id.", {
          id: candidate.id,
          replacementId: hello.id
        });
        this.removeClient(candidate.socket, "replaced_by_new_device_session");
        candidate.socket.close(4001, "replaced_by_new_device_session");
      }
    }
    if (existing) {
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
    this.turnTokens.set(client.turnAccessToken, client);
    this.metrics?.recordEvent("client:joined", {
      clientId: client.id,
      deviceName: client.deviceName,
      deviceFamily: client.deviceFamily
    });
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
    if (message.type === "proximity:session:join") {
      this.joinProximitySession(sender, message);
      return;
    }
    if (message.type === "proximity:session:diagnostic") {
      this.recordProximitySessionDiagnostic(sender, message);
      return;
    }
    if (message.type === "proximity:session:telemetry") {
      this.recordProximitySessionTelemetry(sender, message);
      return;
    }
    if (message.type === "proximity:session:cancel") {
      this.cancelProximitySession(sender, message);
      return;
    }
    if (message.type === "admin:monitor:start") {
      this.startAdminMonitor(sender, message);
      return;
    }
    if (message.type === "admin:monitor:stop") {
      this.stopAdminMonitor(sender, message);
      return;
    }
    if (message.type === "admin:monitor:telemetry") {
      this.forwardAdminMonitorTelemetry(sender, message);
      return;
    }
    if (message.type === "proximity:qr:issue" && !message.targetId) {
      this.issuePeerlessQrToken(sender);
      return;
    }
    if (message.type === "proximity:qr:verify" && !message.targetId) {
      this.verifyPeerlessQrToken(sender, message);
      return;
    }
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
        subjectId: sender.id,
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

  startAdminMonitor(sender, message) {
    if (!sender.capabilities?.admin) {
      this.send(sender.socket, "route:error", {
        code: "admin_required",
        targetId: message.targetId,
        type: message.type
      });
      return;
    }
    const target = this.clients.get(message.targetId);
    if (!target || target.capabilities?.admin) {
      this.send(sender.socket, "route:error", {
        code: target ? "device_required" : "target_offline",
        targetId: message.targetId,
        type: message.type
      });
      return;
    }
    const monitorId = message.payload.monitorId;
    this.adminMonitors.set(monitorId, {
      monitorId,
      adminId: sender.id,
      targetId: target.id,
      createdAt: Date.now()
    });
    this.send(target.socket, "admin:monitor:start", {
      ...message.payload,
      adminId: sender.id,
      deviceId: target.id
    });
    this.send(sender.socket, "admin:monitor:started", {
      monitorId,
      targetId: target.id,
      deviceName: target.deviceName
    });
    this.metrics?.recordEvent("admin:monitor:started", {
      monitorId,
      adminId: sender.id,
      targetId: target.id,
      deviceName: target.deviceName
    });
  }

  stopAdminMonitor(sender, message) {
    const monitor = this.adminMonitors.get(message.payload.monitorId);
    if (!monitor || monitor.adminId !== sender.id || !sender.capabilities?.admin) {
      this.send(sender.socket, "route:error", {
        code: "monitor_not_available",
        targetId: message.targetId,
        type: message.type
      });
      return;
    }
    const target = this.clients.get(monitor.targetId);
    if (target) {
      this.send(target.socket, "admin:monitor:stop", {
        monitorId: monitor.monitorId,
        adminId: sender.id
      });
    }
    this.adminMonitors.delete(monitor.monitorId);
    this.send(sender.socket, "admin:monitor:stopped", {
      monitorId: monitor.monitorId,
      targetId: monitor.targetId
    });
    this.metrics?.recordEvent("admin:monitor:stopped", {
      monitorId: monitor.monitorId,
      adminId: sender.id,
      targetId: monitor.targetId
    });
  }

  forwardAdminMonitorTelemetry(sender, message) {
    const monitor = this.adminMonitors.get(message.payload.monitorId);
    if (!monitor || monitor.targetId !== sender.id || message.targetId !== monitor.adminId) {
      this.send(sender.socket, "route:error", {
        code: "monitor_not_available",
        targetId: message.targetId,
        type: message.type
      });
      return;
    }
    const admin = this.clients.get(monitor.adminId);
    if (!admin?.capabilities?.admin) {
      this.adminMonitors.delete(monitor.monitorId);
      return;
    }
    this.send(admin.socket, "admin:monitor:telemetry", {
      ...message.payload,
      deviceId: sender.id,
      deviceName: sender.deviceName,
      deviceFamily: sender.deviceFamily
    });
    this.metrics?.recordEvent("admin:monitor:telemetry", {
      monitorId: monitor.monitorId,
      clientId: sender.id,
      deviceName: sender.deviceName,
      status: message.payload.status,
      sequence: message.payload.sequence,
      emitted: message.payload.emitted,
      detected: message.payload.detected,
      marginDb: message.payload.marginDb,
      confidence: message.payload.confidence,
      startFrequencyHz: message.payload.startFrequencyHz,
      endFrequencyHz: message.payload.endFrequencyHz,
      sampleRate: message.payload.sampleRate,
      bands: message.payload.bands,
      bumpDetected: message.payload.bumpDetected,
      bumpPoints: message.payload.bumpPoints,
      tiltDetected: message.payload.tiltDetected,
      tiltDegrees: message.payload.tiltDegrees,
      motionSamples: message.payload.motionSamples,
      maxAcceleration: message.payload.maxAcceleration,
      reason: message.payload.reason
    });
  }

  verifyQrToken(sender, target, message) {
    const pairingId = message.pairingId || sender.pairingId || this.findPendingPairingId(sender.id, target.id);
    if (!this.arePaired(sender, target, pairingId)) {
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

  issuePeerlessQrToken(sender) {
    const pairingId = `qr-${randomUUID()}`;
    const issued = this.qrTokenProvider?.issue({
      pairingId,
      issuerId: sender.id,
      targetId: null
    });
    this.send(sender.socket, "proximity:qr:issued", issued);
  }

  verifyPeerlessQrToken(sender, message) {
    const result = this.qrTokenProvider?.verify({
      token: message.payload.token,
      pairingId: message.pairingId,
      verifierId: sender.id,
      targetId: null
    }) || { valid: false, pairingId: null, verifiedAt: null };
    if (!result.valid || !result.issuerId) {
      this.send(sender.socket, "proximity:qr:verified", result);
      return;
    }
    const issuer = this.clients.get(result.issuerId);
    if (!issuer || issuer.id === sender.id || issuer.pairingId || sender.pairingId) {
      this.send(sender.socket, "proximity:qr:verified", { ...result, valid: false, reason: "peer_unavailable" });
      return;
    }
    const pairingId = result.pairingId || makePairingId(sender.id, issuer.id);
    this.activatePair(sender, issuer, pairingId);
    this.proximityDecisions.set(pairingId, new Map([
      [sender.id, "verified"],
      [issuer.id, "verified"]
    ]));
    const payloadForSender = {
      ...result,
      pairingId,
      peerId: issuer.id,
      peer: publicPeer(issuer)
    };
    const payloadForIssuer = {
      ...result,
      pairingId,
      peerId: sender.id,
      peer: publicPeer(sender)
    };
    this.send(sender.socket, "proximity:qr:verified", payloadForSender);
    this.send(issuer.socket, "proximity:qr:verified", payloadForIssuer);
    this.broadcast("peers", this.peerList());
  }

  joinProximitySession(sender, message) {
    if (sender.pairingId) {
      this.send(sender.socket, "proximity:session:failed", { reason: "already_connected" });
      return;
    }
    const now = Date.now();

    // Idempotent re-join: a client already inside an open (not yet started)
    // cohort is re-acknowledged in place rather than double-counted against the
    // global cap or split across two cohorts.
    const existing = this.findProximitySessionForClient(sender.id);
    if (existing && !existing.started && existing.expiresAt > now) {
      existing.nonces.set(sender.id, message.payload.clientNonce);
      this.send(sender.socket, "proximity:session:joined", {
        sessionId: existing.id,
        clientNonce: message.payload.clientNonce,
        joinUntil: existing.joinUntil,
        participantCount: existing.clients.size
      });
      return;
    }

    // Enforce the global participant cap before admitting a NEW participant into
    // any cohort (existing-open or freshly-opened). Rejections are clean: the
    // client receives proximity:session:failed and is not added anywhere.
    const totalParticipants = this.totalProximityParticipants();
    if (totalParticipants >= this.maxTotalProximityParticipants) {
      this.metrics?.recordEvent("proximity:session:rejected", {
        clientId: sender.id,
        reason: "capacity_reached",
        totalParticipants,
        maxTotalParticipants: this.maxTotalProximityParticipants
      });
      this.send(sender.socket, "proximity:session:failed", {
        reason: "capacity_reached",
        maxTotalParticipants: this.maxTotalProximityParticipants
      });
      return;
    }

    const session = this.findOpenProximitySession(now) || this.openProximitySession(now);
    session.clients.add(sender.id);
    session.nonces.set(sender.id, message.payload.clientNonce);
    session.acousticCapabilities ||= new Map();
    session.acousticCapabilities.set(sender.id, message.payload.acousticCapabilities || {});
    this.metrics?.recordEvent("proximity:session:joined", {
      sessionId: session.id,
      clientId: sender.id,
      participantCount: session.clients.size,
      openSessions: this.openProximitySessionIds.size,
      totalParticipants: this.totalProximityParticipants()
    });
    this.send(sender.socket, "proximity:session:joined", {
      sessionId: session.id,
      clientNonce: message.payload.clientNonce,
      joinUntil: session.joinUntil,
      participantCount: session.clients.size
    });
    if (session.clients.size >= 2 && session.joinExtensions > 0 && !session.started) {
      clearTimeout(session.timer);
      session.timer = setTimeout(() => this.startProximitySession(session.id), 300);
      session.timer.unref?.();
    } else if (session.clients.size >= this.maxProximitySessionClients && !session.started) {
      // The cohort is full: close it to new joiners so the next joiner opens a
      // fresh concurrent cohort, and start the ceremony shortly.
      this.openProximitySessionIds.delete(session.id);
      clearTimeout(session.timer);
      session.timer = setTimeout(() => this.startProximitySession(session.id), 100);
      session.timer.unref?.();
    }
  }

  totalProximityParticipants() {
    let total = 0;
    for (const session of this.proximitySessions.values()) total += session.clients.size;
    return total;
  }

  findProximitySessionForClient(clientId) {
    for (const session of this.proximitySessions.values()) {
      if (session.clients.has(clientId)) return session;
    }
    return null;
  }

  findOpenProximitySession(now) {
    for (const sessionId of [...this.openProximitySessionIds]) {
      const session = this.proximitySessions.get(sessionId);
      if (!session || session.started || session.expiresAt <= now || session.clients.size >= this.maxProximitySessionClients) {
        this.openProximitySessionIds.delete(sessionId);
        continue;
      }
      return session;
    }
    return null;
  }

  openProximitySession(now) {
    const session = {
      id: `prox-${randomUUID()}`,
      clients: new Set(),
      nonces: new Map(),
      acousticCapabilities: new Map(),
      signatures: new Map(),
      signatureDetails: new Map(),
      telemetry: new Map(),
      createdAt: now,
      expiresAt: now + this.proximitySessionTtlMs,
      joinUntil: now + this.proximityJoinWindowMs,
      joinExtensions: 0,
      started: false,
      matched: new Set(),
      bandIndex: this.proximityBandCounter++,
      timer: null,
      failTimer: null
    };
    this.proximitySessions.set(session.id, session);
    this.openProximitySessionIds.add(session.id);
    session.timer = setTimeout(() => this.startProximitySession(session.id), this.proximityJoinWindowMs);
    session.timer.unref?.();
    return session;
  }

  startProximitySession(sessionId) {
    const session = this.proximitySessions.get(sessionId);
    if (!session || session.started) return;
    this.pruneProximitySessionClients(session);
    if (session.clients.size < 2) {
      if ((session.joinExtensions || 0) < 1 && session.expiresAt > Date.now()) {
        session.joinExtensions = (session.joinExtensions || 0) + 1;
        session.joinUntil = Date.now() + this.proximityJoinWindowMs;
        this.openProximitySessionIds.add(sessionId);
        session.timer = setTimeout(() => this.startProximitySession(sessionId), this.proximityJoinWindowMs);
        session.timer.unref?.();
        return;
      }
      for (const clientId of session.clients) {
        const client = this.clients.get(clientId);
        if (client) this.send(client.socket, "proximity:session:failed", { sessionId, reason: "no_nearby_partner" });
      }
      this.proximitySessions.delete(sessionId);
      this.openProximitySessionIds.delete(sessionId);
      return;
    }
    session.started = true;
    this.openProximitySessionIds.delete(sessionId);
    // Stagger concurrent cohorts across a few time phases so cohorts that fill
    // at the same instant do not all begin chirping simultaneously. Phase 0 has
    // no offset, so the first/only cohort is unaffected.
    const staggerMs = this.nextProximityStaggerMs();
    session.staggerMs = staggerMs;
    const startAt = Date.now() + this.proximityStartDelayMs + staggerMs;
    session.startAt = startAt;
    session.endsAt = startAt + this.proximityDurationMs;
    const acousticBand = this.selectSessionAcousticBand(session);
    session.acousticBand = acousticBand;
    const acousticPlan = [...session.clients].map((clientId, index) => {
      const signature = {
        id: `sig-${randomUUID()}`,
        startFrequencyHz: acousticBand.startFrequencyHz,
        endFrequencyHz: acousticBand.endFrequencyHz,
        code: index
      };
      session.signatures.set(clientId, signature.id);
      session.signatureDetails.set(clientId, {
        slot: index + 1,
        ...signature
      });
      return signature;
    });
    let slot = 0;
    for (const clientId of session.clients) {
      const client = this.clients.get(clientId);
      if (!client) continue;
      this.send(client.socket, "proximity:session:start", {
        sessionId,
        startAt,
        durationMs: this.proximityDurationMs,
        acousticSlot: slot,
        acousticSignatureId: acousticPlan[slot]?.id,
        acousticPlan,
        acousticAvailable: acousticBand.available,
        // New, additive fields describing the cohort's assigned sub-band so the
        // client/admin can show which frequency lane this cohort is using.
        acousticBandIndex: acousticBand.index,
        acousticBandCount: acousticBand.count,
        participantCount: session.clients.size
      });
      slot += 1;
    }
    this.metrics?.recordEvent("proximity:session:started", {
      sessionId,
      participantCount: session.clients.size,
      startAt,
      durationMs: this.proximityDurationMs,
      staggerMs,
      acousticBandIndex: acousticBand.index,
      acousticBandCount: acousticBand.count,
      acousticStartFrequencyHz: acousticBand.startFrequencyHz,
      acousticEndFrequencyHz: acousticBand.endFrequencyHz
    });
    session.failTimer = setTimeout(
      () => this.failUnmatchedProximitySession(sessionId),
      this.proximityStartDelayMs + staggerMs + this.proximityDurationMs + this.proximityMatchSlopMs
    );
    session.failTimer.unref?.();
  }

  nextProximityStaggerMs() {
    if (this.acousticSessionStaggerMs <= 0 || this.acousticSessionStaggerPhases <= 1) return 0;
    const phase = this.proximityStartCounter % this.acousticSessionStaggerPhases;
    this.proximityStartCounter += 1;
    return phase * this.acousticSessionStaggerMs;
  }

  // Pick the acoustic band for one cohort. All participants in a cohort share
  // ONE band and are separated by time slots (code = slot index). Concurrent
  // cohorts are pinned to different sub-bands (round-robin by creation order)
  // when the usable hardware range is wide enough to fit more than one
  // >= min-bandwidth lane; otherwise every cohort shares the full band.
  selectSessionAcousticBand(session) {
    const sampleRates = [...(session.acousticCapabilities?.values() || [])]
      .map((capability) => Number(capability?.sampleRate))
      .filter((sampleRate) => Number.isFinite(sampleRate) && sampleRate > 0);
    const safeMaximum = sampleRates.length
      ? Math.min(...sampleRates.map((sampleRate) => sampleRate * 0.45 - 100))
      : this.acousticBandEndHz;
    const bandEndHz = Math.min(this.acousticBandEndHz, Math.floor(safeMaximum));
    const totalWidth = bandEndHz - this.acousticBandStartHz;
    if (totalWidth < this.acousticMinBandwidthHz) {
      return {
        available: false,
        index: 0,
        count: 1,
        startFrequencyHz: this.acousticBandStartHz,
        endFrequencyHz: this.acousticBandStartHz + this.acousticMinBandwidthHz
      };
    }
    const maxByWidth = Math.max(1, Math.floor(totalWidth / this.acousticMinBandwidthHz));
    const count = Math.max(1, Math.min(this.acousticMaxConcurrentSubBands, maxByWidth));
    const index = count > 1 ? ((Number(session.bandIndex) || 0) % count) : 0;
    const subBandWidth = Math.floor(totalWidth / count);
    const startFrequencyHz = this.acousticBandStartHz + index * subBandWidth;
    const endFrequencyHz = index === count - 1 ? bandEndHz : startFrequencyHz + subBandWidth;
    return { available: true, index, count, startFrequencyHz, endFrequencyHz };
  }

  hasValidCeremonyTiming(session, timing = {}) {
    return ceremonyTimingValid(session, timing, this.proximityMatchSlopMs);
  }

  pruneProximitySessionClients(session) {
    const seenDeviceIds = new Map();
    for (const clientId of [...session.clients]) {
      const client = this.clients.get(clientId);
      const socketOpen = client?.socket?.readyState === WebSocket.OPEN;
      if (!client || !socketOpen) {
        session.clients.delete(clientId);
        session.nonces.delete(clientId);
        session.acousticCapabilities?.delete(clientId);
        session.telemetry.delete(clientId);
        session.matched.delete(clientId);
        continue;
      }
      const deviceKey = client.deviceId || client.id;
      const previousId = seenDeviceIds.get(deviceKey);
      if (!previousId) {
        seenDeviceIds.set(deviceKey, clientId);
        continue;
      }
      const previous = this.clients.get(previousId);
      const previousSeen = Number(previous?.lastSeenAt || 0);
      const currentSeen = Number(client.lastSeenAt || 0);
      const removeId = currentSeen >= previousSeen ? previousId : clientId;
      const keepId = removeId === previousId ? clientId : previousId;
      seenDeviceIds.set(deviceKey, keepId);
      session.clients.delete(removeId);
      session.nonces.delete(removeId);
      session.acousticCapabilities?.delete(removeId);
      session.telemetry.delete(removeId);
      session.matched.delete(removeId);
    }
  }

  recordProximitySessionTelemetry(sender, message) {
    const sessionId = message.payload.sessionId;
    const session = this.proximitySessions.get(sessionId);
    if (!session || !session.clients.has(sender.id) || session.expiresAt <= Date.now()) {
      this.send(sender.socket, "proximity:session:failed", { sessionId, reason: "session_not_available" });
      return;
    }
    if (!message.payload.clientNonce || session.nonces.get(sender.id) !== message.payload.clientNonce) {
      this.send(sender.socket, "proximity:session:failed", { sessionId, reason: "session_nonce_mismatch" });
      return;
    }
    if (!this.hasValidCeremonyTiming(session, message.payload.timing)) {
      this.send(sender.socket, "proximity:session:failed", { sessionId, reason: "timing_out_of_window" });
      return;
    }
    const analysis = sessionAnalysis(this.proximityAnalyzer, message.payload.metrics || {});
    session.telemetry.set(sender.id, {
      clientId: sender.id,
      analysis,
      acoustic: acousticDiagnostics(message.payload.metrics),
      timing: message.payload.timing || {},
      receivedAt: Date.now()
    });
    this.metrics?.recordEvent("proximity:session:telemetry", {
      sessionId,
      clientId: sender.id,
      deviceName: sender.deviceName,
      deviceFamily: sender.deviceFamily,
      score: analysis.score,
      decision: analysis.decision,
      acousticEmitted: Boolean(message.payload.metrics?.acousticEmitted),
      acousticDetected: Boolean(message.payload.metrics?.acousticDetected),
      acousticSlot: Number(message.payload.metrics?.acousticSlot || 0),
      acousticSlotCount: Number(message.payload.metrics?.acousticSlotCount || 0),
      acousticStartFrequencyHz: Number(message.payload.metrics?.acousticStartFrequencyHz || 0),
      acousticEndFrequencyHz: Number(message.payload.metrics?.acousticEndFrequencyHz || 0),
      acousticMarginDb: Number(message.payload.metrics?.acousticMarginDb || 0),
      acousticCorrelation: Number(message.payload.metrics?.acousticCorrelation || 0),
      acousticDetectionMethod: message.payload.metrics?.acousticDetectionMethod || null,
      acousticSampleRate: Number(message.payload.metrics?.acousticSampleRate || 0),
      acousticRecordingDurationMs: Number(message.payload.metrics?.acousticRecordingDurationMs || 0),
      acousticRecordingRms: Number(message.payload.metrics?.acousticRecordingRms || 0),
      acousticRecordingPeak: Number(message.payload.metrics?.acousticRecordingPeak || 0),
      acousticConfidenceMargin: Number(message.payload.metrics?.acousticConfidenceMargin || 0),
      acousticRunnerUpCorrelation: Number(message.payload.metrics?.acousticRunnerUpCorrelation || 0),
      acousticSignatureId: message.payload.metrics?.acousticSignatureId || null,
      heardAcousticSignatureId: message.payload.metrics?.heardAcousticSignatureId || null,
      acousticDetections: Array.isArray(message.payload.metrics?.acousticDetections)
        ? message.payload.metrics.acousticDetections.slice(0, MAX_ACOUSTIC_DETECTIONS)
        : [],
      bumpCorrelation: Number(message.payload.metrics?.bumpCorrelation || message.payload.metrics?.bump || 0),
      tiltMatch: Number(message.payload.metrics?.tiltMatch || message.payload.metrics?.tilt || 0),
      acousticReason: message.payload.metrics?.acousticReason || null
    });
    this.tryMatchProximitySession(session);
  }

  recordProximitySessionDiagnostic(sender, message) {
    const payload = message.payload || {};
    const sessionId = payload.sessionId || null;
    const session = this.proximitySessions.get(sessionId);
    const inSession = Boolean(session && session.clients.has(sender.id));
    const nonceMatches = Boolean(
      session &&
      payload.clientNonce &&
      session.nonces.get(sender.id) === payload.clientNonce
    );
    this.metrics?.recordEvent("proximity:session:diagnostic", {
      sessionId,
      clientId: sender.id,
      deviceName: sender.deviceName,
      deviceFamily: sender.deviceFamily,
      inSession,
      nonceMatches,
      phase: payload.phase || "unknown",
      state: payload.state || null,
      reason: payload.reason || null,
      message: payload.message || null,
      acoustic: payload.acoustic || {},
      motion: payload.motion || {},
      timing: payload.timing || {}
    });
  }

  tryMatchProximitySession(session) {
    const candidates = [...session.telemetry.values()]
      .filter((entry) => entry.analysis?.decision === "verified" && !session.matched.has(entry.clientId))
      .sort((a, b) => Number(a.timing?.bumpAt || a.receivedAt) - Number(b.timing?.bumpAt || b.receivedAt));
    let best = null;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i];
        const b = candidates[j];
        const delta = Math.abs(Number(a.timing?.bumpAt || a.receivedAt) - Number(b.timing?.bumpAt || b.receivedAt));
        if (delta > this.proximityMatchSlopMs || !hasReciprocalAcousticEvidence(session, a, b)) continue;
        if (!best || delta < best.delta) best = { a, b, delta };
      }
    }
    if (!best) return;
    const first = this.clients.get(best.a.clientId);
    const second = this.clients.get(best.b.clientId);
    if (!first || !second || first.pairingId || second.pairingId) return;
    const pairingId = makePairingId(first.id, second.id);
    this.activatePair(first, second, pairingId);
    session.matched.add(first.id);
    session.matched.add(second.id);
    this.proximityDecisions.set(pairingId, new Map([
      [first.id, "verified"],
      [second.id, "verified"]
    ]));
    this.send(first.socket, "proximity:match", {
      sessionId: session.id,
      pairingId,
      peerId: second.id,
      peer: publicPeer(second),
      score: best.a.analysis.score
    });
    this.send(second.socket, "proximity:match", {
      sessionId: session.id,
      pairingId,
      peerId: first.id,
      peer: publicPeer(first),
      score: best.b.analysis.score
    });
    this.metrics?.recordEvent("proximity:session:matched", {
      sessionId: session.id,
      pairingId,
      clientIds: [first.id, second.id],
      score: Math.min(best.a.analysis.score, best.b.analysis.score)
    });
    this.broadcast("peers", this.peerList());
    if ([...session.clients].every((clientId) => session.matched.has(clientId))) {
      clearTimeout(session.timer);
      clearTimeout(session.failTimer);
      this.proximitySessions.delete(session.id);
      this.openProximitySessionIds.delete(session.id);
    }
  }

  failUnmatchedProximitySession(sessionId) {
    const session = this.proximitySessions.get(sessionId);
    if (!session) return;
    for (const clientId of session.clients) {
      if (session.matched.has(clientId)) continue;
      const client = this.clients.get(clientId);
      const entry = session.telemetry.get(clientId);
      if (!client || client.pairingId) continue;
      this.send(client.socket, "proximity:session:failed", {
        sessionId,
        reason: proximityFailureReason(entry?.analysis),
        score: entry?.analysis?.score ?? null,
        analysis: entry?.analysis || null
      });
      this.metrics?.recordEvent("proximity:session:failed", {
        sessionId,
        clientId,
        reason: proximityFailureReason(entry?.analysis),
        score: entry?.analysis?.score ?? null
      });
    }
    clearTimeout(session.timer);
    clearTimeout(session.failTimer);
    this.proximitySessions.delete(sessionId);
    this.openProximitySessionIds.delete(sessionId);
  }

  cancelProximitySession(sender, message) {
    const sessionId = message.payload.sessionId;
    const session = this.proximitySessions.get(sessionId);
    if (!session) return;
    session.clients.delete(sender.id);
    session.telemetry.delete(sender.id);
    if (!session.clients.size) {
      clearTimeout(session.timer);
      clearTimeout(session.failTimer);
      this.proximitySessions.delete(sessionId);
      this.openProximitySessionIds.delete(sessionId);
    }
  }

  activatePair(sender, target, pairingId) {
    const activePair = new Set([sender.id, target.id]);
    activePair.expiresAt = Date.now() + this.sessionTtlMs;
    this.activePairs.set(pairingId, activePair);
    sender.pairingId = pairingId;
    target.pairingId = pairingId;
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
      if (pending?.expiresAt <= Date.now()) this.pendingInvites.delete(pairingId);
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
    this.activatePair(sender, target, pairingId);
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
    const pending = this.pendingInvites.get(pairingId);
    if (!pending || pending.expiresAt <= Date.now() || pending.fromId !== target.id || pending.toId !== sender.id) {
      if (pending?.expiresAt <= Date.now()) this.pendingInvites.delete(pairingId);
      this.send(sender.socket, "route:error", {
        code: "invite_not_pending",
        targetId: target.id,
        type: message.type
      });
      return;
    }
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
    const client = this.turnTokens.get(token);
    if (!client || this.clients.get(client.id) !== client) return null;
    if (clientId && client.id !== clientId) return null;
    client.lastSeenAt = Date.now();
    if (client.pairingId) this.touchPair(client.pairingId);
    return client;
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

  diagnosticsSnapshot() {
    const now = Date.now();
    return {
      protocol: {
        joinWindowMs: this.proximityJoinWindowMs,
        startDelayMs: this.proximityStartDelayMs,
        sessionDurationMs: this.proximityDurationMs,
        sessionTtlMs: this.proximitySessionTtlMs,
        matchSlopMs: this.proximityMatchSlopMs,
        scoreMinimum: SESSION_SCORE_MINIMUM,
        maxClients: this.maxProximitySessionClients,
        cohortCeiling: this.proximityCohortCeiling,
        slotFloorMs: ACOUSTIC_CEREMONY_SLOT_FLOOR_MS,
        maxTotalParticipants: this.maxTotalProximityParticipants,
        openSessions: this.openProximitySessionIds.size,
        totalParticipants: this.totalProximityParticipants(),
        acousticSessionStaggerMs: this.acousticSessionStaggerMs,
        acousticSessionStaggerPhases: this.acousticSessionStaggerPhases,
        acousticMaxConcurrentSubBands: this.acousticMaxConcurrentSubBands,
        acousticBandStartHz: this.acousticBandStartHz,
        acousticBandEndHz: this.acousticBandEndHz,
        acousticMinBandwidthHz: this.acousticMinBandwidthHz,
        acousticWinnerMargin: ACOUSTIC_WINNER_MARGIN,
        acousticMinCorrelation: ACOUSTIC_MIN_CORRELATION,
        acousticSlotCorrelationMin: ACOUSTIC_SLOT_CORRELATION_MIN,
        acousticPacketConsensusMinCorrelation: ACOUSTIC_PACKET_CONSENSUS_MIN_CORRELATION,
        acousticPacketConsensusMinCount: ACOUSTIC_PACKET_CONSENSUS_MIN_COUNT,
        energyAssistedMinCorrelation: ACOUSTIC_ENERGY_ASSISTED_MIN_CORRELATION,
        energyAssistedMinMarginDb: ACOUSTIC_ENERGY_ASSISTED_MIN_MARGIN_DB
      },
      clients: [...this.clients.values()].map((client) => ({
        id: client.id,
        deviceName: client.deviceName,
        deviceFamily: client.deviceFamily,
        deviceLabel: client.deviceLabel,
        joinedAt: client.joinedAt,
        lastSeenMsAgo: Math.max(0, now - Number(client.lastSeenAt || now)),
        pairingId: client.pairingId || null,
        capabilities: {
          microphone: Boolean(client.capabilities?.microphone),
          motion: Boolean(client.capabilities?.motion),
          webRtc: Boolean(client.capabilities?.webRtc),
          admin: Boolean(client.capabilities?.admin)
        }
      })),
      pairs: [...this.activePairs.entries()].map(([pairingId, pair]) => ({
        pairingId,
        clientIds: [...pair],
        expiresInMs: Math.max(0, Number(pair.expiresAt || now) - now)
      })),
      proximitySessions: [...this.proximitySessions.values()].map((session) => ({
        id: session.id,
        phase: session.started ? "running" : "joining",
        participantCount: session.clients.size,
        createdAt: new Date(session.createdAt).toISOString(),
        startAt: session.startAt || null,
        endsAt: session.endsAt || null,
        staggerMs: session.staggerMs || 0,
        acousticBand: session.acousticBand
          ? {
            index: session.acousticBand.index,
            count: session.acousticBand.count,
            startFrequencyHz: session.acousticBand.startFrequencyHz,
            endFrequencyHz: session.acousticBand.endFrequencyHz
          }
          : null,
        participants: [...session.clients].map((clientId) => {
          const client = this.clients.get(clientId);
          const telemetry = session.telemetry.get(clientId);
          return {
            clientId,
            deviceName: client?.deviceName || clientId,
            acousticCapabilities: publicAcousticCapabilities(session.acousticCapabilities?.get(clientId)),
            signature: session.signatureDetails?.get(clientId) || null,
            telemetry: telemetry ? {
              receivedAt: new Date(telemetry.receivedAt).toISOString(),
              score: telemetry.analysis?.score ?? null,
              decision: telemetry.analysis?.decision || null,
              physicalEvidence: telemetry.analysis?.physicalEvidence || null,
              acoustic: telemetry.acoustic || null,
              timing: { ...telemetry.timing }
            } : null
          };
        })
      }))
    };
  }

  broadcast(type, payload, { exceptId } = {}) {
    // Serialize the frame once instead of re-stringifying the (potentially large)
    // peer list for every recipient. This keeps fan-out broadcasts O(n) rather
    // than O(n^2) on the hot join/leave path.
    const frame = JSON.stringify({ type, payload });
    for (const client of this.clients.values()) {
      if (client.id === exceptId) continue;
      const socket = client.socket;
      if (socket.readyState === WebSocket.OPEN) socket.send(frame);
    }
  }

  removeClient(socket, reason) {
    const client = this.socketToClient.get(socket);
    if (!client) return;
    if (this.turnTokens.get(client.turnAccessToken) === client) {
      this.turnTokens.delete(client.turnAccessToken);
    }
    if (this.clients.get(client.id) !== client) {
      this.socketToClient.delete(socket);
      return;
    }
    this.clients.delete(client.id);
    this.socketToClient.delete(socket);
    this.metrics?.recordEvent("client:left", {
      clientId: client.id,
      deviceName: client.deviceName,
      reason
    });
    this.logger?.info("Client left signaling.", { id: client.id, reason });
    for (const [sessionId, session] of this.proximitySessions) {
      if (!session.clients.delete(client.id)) continue;
      session.telemetry.delete(client.id);
      session.matched.delete(client.id);
      if (!session.clients.size) {
        clearTimeout(session.timer);
        clearTimeout(session.failTimer);
        this.proximitySessions.delete(sessionId);
        this.openProximitySessionIds.delete(sessionId);
      }
    }
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
    for (const [monitorId, monitor] of this.adminMonitors) {
      if (monitor.adminId !== client.id && monitor.targetId !== client.id) continue;
      const counterpartId = monitor.adminId === client.id ? monitor.targetId : monitor.adminId;
      const counterpart = this.clients.get(counterpartId);
      if (counterpart) {
        this.send(counterpart.socket, "admin:monitor:stopped", {
          monitorId,
          targetId: monitor.targetId,
          reason: "device_disconnected"
        });
      }
      this.adminMonitors.delete(monitorId);
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
    for (const session of this.proximitySessions.values()) {
      clearTimeout(session.timer);
      clearTimeout(session.failTimer);
    }
    this.proximitySessions.clear();
    this.openProximitySessionIds.clear();
    this.adminMonitors.clear();
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

function sessionAnalysis(analyzer, metrics = {}) {
  const analyzed = analyzer?.analyze
    ? analyzer.analyze(metrics)
    : fallbackSessionAnalysis(metrics);
  const score = Number(analyzed?.score || 0);
  const normalized = analyzed?.normalized || fallbackNormalizedMetrics(metrics);
  const physicalEvidence = {
    ultrasound: normalized.sound >= 0.5,
    bump: normalized.bump >= 0.5,
    tilt: normalized.tilt >= 0.5
  };
  const hasRequiredPhysicalEvidence = Object.values(physicalEvidence).every(Boolean);
  return {
    ...analyzed,
    acousticSignatureId: metrics.acousticSignatureId || null,
    heardAcousticSignatureId: metrics.heardAcousticSignatureId || null,
    acousticConfidenceMargin: metrics.acousticConfidenceMargin == null
      ? null
      : Number(metrics.acousticConfidenceMargin),
    acousticDetections: Array.isArray(metrics.acousticDetections) ? metrics.acousticDetections : [],
    physicalEvidence,
    decision: score >= SESSION_SCORE_MINIMUM && hasRequiredPhysicalEvidence
      ? "verified"
      : "insufficient"
  };
}

function ceremonyTimingValid(session, timing = {}, matchSlopMs = DEFAULT_SESSION_MATCH_SLOP_MS) {
  const startedAt = Number(timing?.startedAt);
  const bumpAt = Number(timing?.bumpAt);
  const completedAt = Number(timing?.completedAt);
  if (![startedAt, bumpAt, completedAt].every(Number.isFinite)) return false;
  if (!Number.isFinite(session.startAt) || !Number.isFinite(session.endsAt)) return false;
  if (Date.now() < session.startAt - 250) return false;
  return Math.abs(startedAt - session.startAt) <= 250
    && bumpAt >= session.startAt - 250
    && bumpAt <= session.endsAt + matchSlopMs
    && completedAt >= bumpAt
    && completedAt <= session.endsAt + matchSlopMs;
}

function hasReciprocalAcousticEvidence(session, first, second) {
  const firstSignature = session.signatures?.get(first.clientId);
  const secondSignature = session.signatures?.get(second.clientId);
  const firstDetection = acousticDetectionFor(first.analysis, secondSignature);
  const secondDetection = acousticDetectionFor(second.analysis, firstSignature);
  return Boolean(firstSignature && secondSignature
    && first.analysis?.acousticSignatureId === firstSignature
    && second.analysis?.acousticSignatureId === secondSignature
    && first.analysis?.heardAcousticSignatureId === secondSignature
    && second.analysis?.heardAcousticSignatureId === firstSignature
    && hasUsableAcousticDetection(firstDetection)
    && hasUsableAcousticDetection(secondDetection)
    && hasSufficientWinnerMargin(first.analysis)
    && hasSufficientWinnerMargin(second.analysis));
}

// Fail safe: a missing or non-finite margin is treated as a failed winner-margin
// check, never an automatic pass, so a device that never measured signature
// separation cannot be matched by default.
function hasSufficientWinnerMargin(analysis) {
  const margin = Number(analysis?.acousticConfidenceMargin);
  return Number.isFinite(margin) && margin >= ACOUSTIC_WINNER_MARGIN;
}

function acousticDetectionFor(analysis, signatureId) {
  const detections = Array.isArray(analysis?.acousticDetections) ? analysis.acousticDetections : [];
  return detections.find((entry) => entry.signatureId === signatureId)
    || { correlation: analysis?.heardAcousticSignatureId === signatureId ? 1 : 0 };
}

function hasUsableAcousticDetection(detection) {
  const correlation = Number(detection?.correlation || 0);
  const marginDb = Number(detection?.marginDb || 0);
  if (correlation >= ACOUSTIC_MIN_CORRELATION) return true;
  if (detection?.detectionMethod === "slot-correlation" && correlation >= ACOUSTIC_SLOT_CORRELATION_MIN) return true;
  if (detection?.detectionMethod === "packet-consensus") {
    return Number(detection?.packetCount || 0) >= ACOUSTIC_PACKET_CONSENSUS_MIN_COUNT
      && Number(detection?.packetAverageCorrelation || correlation) >= ACOUSTIC_PACKET_CONSENSUS_MIN_CORRELATION;
  }
  return Boolean(detection?.energyAssisted || detection?.detectionMethod === "energy-assisted")
    && correlation >= ACOUSTIC_ENERGY_ASSISTED_MIN_CORRELATION
    && marginDb >= ACOUSTIC_ENERGY_ASSISTED_MIN_MARGIN_DB;
}

function fallbackSessionAnalysis(metrics = {}) {
  const normalized = fallbackNormalizedMetrics(metrics);
  const { sound, motion, bump, tilt, qr } = normalized;
  const score = sound * 0.34 + motion * 0.26 + bump * 0.2 + tilt * 0.12 + qr * 0.08;
  return {
    enabled: false,
    mode: "fallback",
    normalized,
    score,
    decision: score >= SESSION_SCORE_MINIMUM ? "verified" : "insufficient"
  };
}

function fallbackNormalizedMetrics(metrics = {}) {
  return {
    sound: metricValue(metrics.soundCorrelation ?? metrics.acoustic ?? metrics.audio),
    motion: metricValue(metrics.motionCorrelation ?? metrics.motion),
    bump: metricValue(metrics.bumpCorrelation ?? metrics.bump),
    tilt: metricValue(metrics.tiltMatch ?? metrics.tilt),
    qr: metricValue(metrics.qrMatch ?? metrics.qrFallback)
  };
}

function metricValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function acousticDiagnostics(metrics = {}) {
  return {
    emitted: Boolean(metrics.acousticEmitted),
    detected: Boolean(metrics.acousticDetected),
    mode: metrics.acousticMode || null,
    slot: Number(metrics.acousticSlot || 0),
    slotCount: Number(metrics.acousticSlotCount || 0),
    startFrequencyHz: finiteOrNull(metrics.acousticStartFrequencyHz),
    endFrequencyHz: finiteOrNull(metrics.acousticEndFrequencyHz),
    marginDb: finiteOrNull(metrics.acousticMarginDb),
    detectionMethod: metrics.acousticDetectionMethod || null,
    sampleRate: finiteOrNull(metrics.acousticSampleRate),
    recordingDurationMs: finiteOrNull(metrics.acousticRecordingDurationMs),
    recordingRms: finiteOrNull(metrics.acousticRecordingRms),
    recordingPeak: finiteOrNull(metrics.acousticRecordingPeak),
    confidenceMargin: finiteOrNull(metrics.acousticConfidenceMargin),
    runnerUpCorrelation: finiteOrNull(metrics.acousticRunnerUpCorrelation),
    detections: Array.isArray(metrics.acousticDetections)
      ? metrics.acousticDetections.slice(0, MAX_ACOUSTIC_DETECTIONS)
      : [],
    reason: metrics.acousticReason || null
  };
}

function publicAcousticCapabilities(capabilities = {}) {
  return {
    sampleRate: finiteOrNull(capabilities.sampleRate),
    strictInaudible: Boolean(capabilities.strictInaudible),
    audioContextReady: Boolean(capabilities.audioContextReady),
    microphoneReady: Boolean(capabilities.microphoneReady)
  };
}

function proximityFailureReason(analysis) {
  if (!analysis) return "telemetry_missing";
  if (!analysis.physicalEvidence?.ultrasound) return "acoustic_not_detected";
  if (!analysis.physicalEvidence?.bump) return "bump_not_detected";
  if (!analysis.physicalEvidence?.tilt) return "tilt_not_detected";
  if (Number(analysis.score || 0) < SESSION_SCORE_MINIMUM) return "score_too_low";
  return "ambiguous_or_nonreciprocal_match";
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Resolve an env/option override, falling back to the default when the value is
// missing or invalid. `configuredPositive` requires a strictly positive number;
// `configuredNonNegative` allows 0 (used so a stagger of 0 explicitly disables
// the cross-session start offset rather than reverting to the default).
function configuredPositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function configuredNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

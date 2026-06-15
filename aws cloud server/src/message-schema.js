export const MAX_CHAT_TEXT_LENGTH = 2000;
export const MAX_FILES_PER_MANIFEST = 50;
export const MAX_FILE_NAME_LENGTH = 240;
export const MAX_SIGNAL_SIZE_BYTES = 32768;
export const MAX_SDP_LENGTH = 30000;
export const MAX_ICE_CANDIDATE_LENGTH = 4096;

const ROUTED_TYPES = new Set([
  "invite",
  "invite:accept",
  "invite:reject",
  "proximity:ready",
  "proximity:telemetry",
  "proximity:qr:issue",
  "proximity:qr:verify",
  "proximity:fallback",
  "rtc:signal",
  "rtc:path-metric",
  "chat:message",
  "transfer:manifest",
  "transfer:control",
  "peer:disconnect"
]);

const TRANSFER_ACTIONS = new Set([
  "ready",
  "pause",
  "resume",
  "cancel",
  "ack",
  "retry",
  "complete",
  "error"
]);

export function parseJsonMessage(raw, maxBytes) {
  if (typeof raw !== "string") {
    throw new ProtocolError("binary_not_allowed", "Binary WebSocket frames are not allowed. Use RTCDataChannel for file chunks.");
  }
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > maxBytes) {
    throw new ProtocolError("message_too_large", `JSON message exceeds ${maxBytes} bytes.`);
  }
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    throw new ProtocolError("invalid_json", "Message is not valid JSON.");
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new ProtocolError("invalid_message", "Message must be a JSON object.");
  }
  if (typeof message.type !== "string") {
    throw new ProtocolError("missing_type", "Message type is required.");
  }
  return message;
}

export function validateClientHello(message) {
  if (message.type !== "client:hello") {
    throw new ProtocolError("hello_required", "First message must be client:hello.");
  }
  const payload = objectPayload(message.payload);
  const self = objectPayload(payload.self || payload);
  const deviceName = cleanString(self.deviceName || self.name, 80) || "WebDrop device";
  const id = cleanString(self.id, 120) || cryptoRandomId("client");
  return {
    id,
    deviceName,
    avatarId: cleanString(self.avatarId, 80) || null,
    ringColor: cleanString(self.ringColor, 40) || null,
    capabilities: objectPayload(payload.capabilities || {})
  };
}

export function validateRoutedMessage(message) {
  if (!ROUTED_TYPES.has(message.type)) {
    throw new ProtocolError("unsupported_type", `Unsupported message type: ${message.type}`);
  }
  const targetId = cleanString(message.targetId || message.peerId, 120);
  if (!targetId) throw new ProtocolError("missing_target", "targetId is required.");
  const pairingId = cleanString(message.pairingId, 160);
  const base = {
    type: message.type,
    targetId,
    pairingId: pairingId || null
  };

  if (message.type === "chat:message") {
    const payload = objectPayload(message.payload || message);
    const text = cleanString(payload.text, MAX_CHAT_TEXT_LENGTH);
    if (!text) throw new ProtocolError("missing_chat_text", "chat:message requires text.");
    return {
      ...base,
      payload: {
        id: cleanString(payload.id, 120) || cryptoRandomId("chat"),
        text,
        createdAt: cleanString(payload.createdAt, 40) || new Date().toISOString()
      }
    };
  }

  if (message.type === "rtc:signal") {
    const signal = validateRtcSignal(objectPayload(message.signal || message.payload));
    const signalBytes = Buffer.byteLength(JSON.stringify(signal), "utf8");
    if (signalBytes > MAX_SIGNAL_SIZE_BYTES) {
      throw new ProtocolError("signal_too_large", "RTC signal payload is too large.");
    }
    return { ...base, signal };
  }

  if (message.type === "rtc:path-metric") {
    const payload = objectPayload(message.payload || message);
    const path = cleanString(payload.path, 20);
    return {
      ...base,
      payload: {
        path: ["direct", "relay", "failed", "unknown"].includes(path) ? path : "unknown",
        rttMs: safeNumber(payload.rttMs),
        bytesSent: safeInteger(payload.bytesSent, 0),
        bytesReceived: safeInteger(payload.bytesReceived, 0)
      }
    };
  }

  if (message.type === "proximity:qr:issue") {
    return {
      ...base,
      payload: {}
    };
  }

  if (message.type === "proximity:qr:verify") {
    const payload = objectPayload(message.payload);
    const token = cleanString(payload.token, 180);
    if (!token) throw new ProtocolError("missing_qr_token", "proximity:qr:verify requires a token.");
    return {
      ...base,
      payload: { token }
    };
  }

  if (message.type === "transfer:manifest") {
    return {
      ...base,
      payload: validateTransferManifest(objectPayload(message.payload))
    };
  }

  if (message.type === "transfer:control") {
    const payload = objectPayload(message.payload);
    const action = cleanString(payload.action, 40);
    if (!TRANSFER_ACTIONS.has(action)) {
      throw new ProtocolError("invalid_transfer_action", "transfer:control action is invalid.");
    }
    return {
      ...base,
      payload: {
        transferId: cleanString(payload.transferId, 120) || null,
        action,
        fileId: cleanString(payload.fileId, 120) || null,
        offset: safeInteger(payload.offset, 0),
        receivedBytes: safeInteger(payload.receivedBytes, 0),
        reason: cleanString(payload.reason, 500) || null
      }
    };
  }

  if (message.type === "proximity:telemetry") {
    return {
      ...base,
      metrics: validateProximityMetrics(objectPayload(message.metrics || message.payload || {}))
    };
  }

  if (message.type === "proximity:ready") {
    return {
      ...base,
      payload: {}
    };
  }

  return {
    ...base,
    payload: objectPayload(message.payload || {})
  };
}

export function publicPeer(client) {
  return {
    id: client.id,
    name: client.deviceName,
    deviceName: client.deviceName,
    avatarId: client.avatarId,
    ringColor: client.ringColor,
    connected: Boolean(client.pairingId),
    joinedAt: client.joinedAt,
    capabilities: publicCapabilities(client.capabilities)
  };
}

function publicCapabilities(capabilities) {
  const source = objectPayload(capabilities);
  const platform = objectPayload(source.platform);
  return {
    camera: source.camera === true,
    qrScanner: source.qrScanner === true,
    webRtc: source.webRtc === true,
    platform: {
      family: cleanString(platform.family, 20) || "unknown",
      isIOS: platform.isIOS === true,
      isIPhone: platform.isIPhone === true,
      dynamicIslandCapable: platform.dynamicIslandCapable === true
    }
  };
}

export class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

function validateTransferManifest(payload) {
  const transferId = cleanString(payload.transferId, 120) || cryptoRandomId("transfer");
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (!files.length) throw new ProtocolError("missing_files", "transfer:manifest requires at least one file.");
  if (files.length > MAX_FILES_PER_MANIFEST) {
    throw new ProtocolError("too_many_files", `transfer:manifest supports up to ${MAX_FILES_PER_MANIFEST} files.`);
  }
  const normalizedFiles = files.map((file, index) => ({
    id: cleanString(file.id, 120) || `${transferId}-${index}`,
    name: cleanString(file.name, MAX_FILE_NAME_LENGTH) || `file-${index + 1}`,
    type: cleanString(file.type, 120) || "application/octet-stream",
    size: safeInteger(file.size, 0),
    chunks: safeInteger(file.chunks, 0),
    lastModified: safeInteger(file.lastModified, 0)
  }));
  const totalBytes = safeInteger(payload.totalBytes, 0);
  const calculatedBytes = normalizedFiles.reduce((sum, file) => sum + file.size, 0);
  if (calculatedBytes !== totalBytes) {
    throw new ProtocolError("manifest_size_mismatch", "transfer:manifest totalBytes must equal the sum of file sizes.");
  }
  return {
    transferId,
    totalBytes,
    chunkSize: safeInteger(payload.chunkSize, 65536),
    files: normalizedFiles
  };
}

function validateRtcSignal(signal) {
  const type = cleanString(signal.type, 40);
  if (type === "offer" || type === "answer") {
    const sdp = cleanString(signal.sdp, MAX_SDP_LENGTH);
    if (!sdp) throw new ProtocolError("invalid_rtc_signal", `${type} requires sdp.`);
    return { type, sdp };
  }
  if (type === "candidate") {
    const candidate = objectPayload(signal.candidate || signal);
    const candidateText = cleanString(candidate.candidate, MAX_ICE_CANDIDATE_LENGTH);
    if (!candidateText) throw new ProtocolError("invalid_rtc_signal", "candidate requires candidate text.");
    return {
      type,
      candidate: {
        candidate: candidateText,
        sdpMid: cleanString(candidate.sdpMid, 120) || null,
        sdpMLineIndex: Number.isInteger(candidate.sdpMLineIndex) ? candidate.sdpMLineIndex : null,
        usernameFragment: cleanString(candidate.usernameFragment, 256) || null
      }
    };
  }
  throw new ProtocolError("invalid_rtc_signal", "RTC signal type must be offer, answer, or candidate.");
}

function validateProximityMetrics(metrics) {
  return {
    soundCorrelation: scoreMetric(metrics.soundCorrelation ?? metrics.acoustic),
    motionCorrelation: scoreMetric(metrics.motionCorrelation),
    bumpCorrelation: scoreMetric(metrics.bumpCorrelation ?? metrics.bump),
    tiltMatch: scoreMetric(metrics.tiltMatch ?? metrics.tilt),
    qrMatch: scoreMetric(metrics.qrMatch ?? metrics.qrFallback),
    tokenFresh: Boolean(metrics.tokenFresh),
    lowRttHint: Boolean(metrics.lowRttHint)
  };
}

function scoreMetric(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function objectPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function safeInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function cryptoRandomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

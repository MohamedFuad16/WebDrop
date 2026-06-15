const TOKEN_PREFIX = "wdp1";

export function createQrToken({
  sessionId,
  now = Date.now(),
  ttlMs = 60_000,
  nonce = randomNonce()
} = {}) {
  if (!sessionId) throw new Error("sessionId is required");
  const payload = {
    version: 1,
    sessionId,
    nonce,
    issuedAt: now,
    expiresAt: now + ttlMs
  };
  return `${TOKEN_PREFIX}.${encodePayload(payload)}`;
}

export function decodeQrToken(token) {
  const [prefix, encoded, extra] = String(token || "").split(".");
  if (prefix !== TOKEN_PREFIX || !encoded || extra) {
    throw new Error("Invalid proximity token format");
  }
  const payload = JSON.parse(decodePayload(encoded));
  if (payload.version !== 1 || !payload.sessionId || !payload.nonce) {
    throw new Error("Invalid proximity token payload");
  }
  return payload;
}

export function validateQrToken(token, {
  sessionId,
  now = Date.now(),
  maxClockSkewMs = 5000
} = {}) {
  try {
    const payload = decodeQrToken(token);
    if (sessionId && payload.sessionId !== sessionId) {
      return { valid: false, reason: "session-mismatch", payload };
    }
    if (payload.issuedAt > now + maxClockSkewMs) {
      return { valid: false, reason: "not-yet-valid", payload };
    }
    if (payload.expiresAt < now - maxClockSkewMs) {
      return { valid: false, reason: "expired", payload };
    }
    return { valid: true, reason: "valid", payload };
  } catch (error) {
    return { valid: false, reason: "malformed", error };
  }
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToBase64Url(bytes);
}

function encodePayload(payload) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(encoded) {
  const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

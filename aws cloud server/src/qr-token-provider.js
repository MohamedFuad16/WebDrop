import { createHash, randomBytes } from "node:crypto";

export class QrTokenProvider {
  constructor({ ttlMs = 120000 } = {}) {
    this.ttlMs = ttlMs;
    this.tokens = new Map();
  }

  issue({ pairingId, issuerId, targetId }) {
    this.sweep();
    const token = randomBytes(18).toString("base64url");
    const tokenDigest = digest(token);
    const expiresAt = Date.now() + this.ttlMs;
    this.tokens.set(tokenDigest, {
      pairingId,
      issuerId,
      targetId,
      expiresAt,
      used: false
    });
    return { token, pairingId, expiresAt };
  }

  verify({ token, pairingId, verifierId, targetId }) {
    this.sweep();
    const tokenDigest = digest(token);
    const record = this.tokens.get(tokenDigest);
    const valid = Boolean(
      record &&
      !record.used &&
      record.pairingId === pairingId &&
      record.targetId === verifierId &&
      record.issuerId === targetId &&
      record.expiresAt > Date.now()
    );
    if (valid) {
      record.used = true;
      this.tokens.delete(tokenDigest);
    }
    return {
      valid,
      pairingId,
      verifiedAt: valid ? new Date().toISOString() : null
    };
  }

  sweep() {
    const now = Date.now();
    for (const [tokenDigest, record] of this.tokens) {
      if (record.used || record.expiresAt <= now) this.tokens.delete(tokenDigest);
    }
  }
}

function digest(token) {
  return createHash("sha256").update(String(token)).digest("base64url");
}

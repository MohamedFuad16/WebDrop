const CLOUDFLARE_TURN_URL = "https://rtc.live.cloudflare.com/v1/turn/keys";
const DEFAULT_TTL_SECONDS = 86400;
const MAX_TTL_SECONDS = 172800;

export class TurnConfigProvider {
  constructor({ env = process.env, fetchImpl = fetch, logger } = {}) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.cache = new Map();
  }

  async getIceServers({ customIdentifier } = {}) {
    const keyId = this.env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = this.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !apiToken) {
      if (this.env.ALLOW_STUN_FALLBACK === "false") {
        throw new Error("Cloudflare TURN credentials are not configured and STUN fallback is disabled.");
      }
      this.logger?.warn("Cloudflare TURN is not configured; returning STUN fallback.");
      return fallbackIceServers();
    }

    const ttl = clampTtl(Number(this.env.TURN_TTL_SECONDS || DEFAULT_TTL_SECONDS));
    const cacheSeconds = clampCache(Number(this.env.TURN_CACHE_SECONDS || 30), ttl);
    const cacheKey = `${customIdentifier || "anonymous"}:${ttl}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.iceServers;

    const body = { ttl };
    const safeIdentifier = sanitizeCustomIdentifier(customIdentifier);
    if (safeIdentifier) body.customIdentifier = safeIdentifier;

    const response = await this.fetchImpl(`${CLOUDFLARE_TURN_URL}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await safeText(response);
      this.logger?.error("Cloudflare TURN credential request failed.", {
        status: response.status,
        bodyBytes: Buffer.byteLength(text, "utf8")
      });
      if (this.env.ALLOW_STUN_FALLBACK !== "false") return fallbackIceServers();
      throw new Error(`Cloudflare TURN credential request failed with ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.iceServers)) {
      throw new Error("Cloudflare TURN response did not include iceServers.");
    }

    this.cache.set(cacheKey, {
      iceServers: data.iceServers,
      expiresAt: Date.now() + cacheSeconds * 1000
    });
    return data.iceServers;
  }

  getRelayPolicy() {
    return {
      relayLimitBytes: parsePositiveInt(this.env.TURN_RELAY_LIMIT_BYTES, 500 * 1024 * 1024),
      ttlSeconds: clampTtl(Number(this.env.TURN_TTL_SECONDS || DEFAULT_TTL_SECONDS)),
      message: "Relay is reserved for strict networks; direct WebRTC paths are preferred when available."
    };
  }
}

export function fallbackIceServers() {
  return [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }
  ];
}

function clampTtl(value) {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(Math.floor(value), MAX_TTL_SECONDS);
}

function clampCache(value, ttl) {
  if (!Number.isFinite(value) || value < 0) return 30;
  return Math.min(Math.floor(value), Math.max(0, ttl - 60), 300);
}

function parsePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function sanitizeCustomIdentifier(value) {
  if (!value) return "";
  // Cloudflare rejects custom identifiers longer than 64 characters with
  // "invalid argument"; WebDrop browser client ids can be longer than that.
  return String(value)
    .replace(/[^a-zA-Z0-9_.:-]/g, "-")
    .slice(0, 64);
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

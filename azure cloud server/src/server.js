import http from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "./logger.js";
import { PermissionPolicyProvider } from "./permission-policy.js";
import { ProximityScoreAnalyzer } from "./proximity-score.js";
import { QrTokenProvider } from "./qr-token-provider.js";
import { TokenBucket } from "./rate-limits.js";
import { ServerMetrics } from "./metrics.js";
import { SignalingHub } from "./signaling-hub.js";
import { TurnConfigProvider } from "./turn-provider.js";

const logger = createLogger("server");

export function createWebDropServer({ env = process.env, logger: providedLogger = logger, fetchImpl = fetch } = {}) {
  const environmentStatus = validateServerEnvironment(env);
  const maxJsonBytes = parsePositiveInt(env.MAX_JSON_BYTES, 65536);
  const turnProvider = new TurnConfigProvider({ env, fetchImpl, logger: providedLogger });
  const permissionPolicy = new PermissionPolicyProvider({ env });
  const proximityAnalyzer = new ProximityScoreAnalyzer({
    enabled: env.ENABLE_PROXIMITY_ANALYSIS === "true"
  });
  const qrTokenProvider = new QrTokenProvider({
    ttlMs: parsePositiveInt(env.QR_TOKEN_TTL_MS, 120000)
  });
  const metrics = new ServerMetrics();
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const httpRateLimits = new TokenBucket({ capacity: 60, refillPerSecond: 10 });

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const origin = request.headers.origin;
      const corsHeaders = allowedOriginHeaders(origin, allowedOrigins);
      if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
        if (!corsHeaders) {
          sendJson(response, 403, { error: "origin_not_allowed" });
          return;
        }
        response.writeHead(204, {
          ...corsHeaders,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "600"
        });
        response.end();
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) {
          sendJson(response, 403, { error: "origin_not_allowed" });
          return;
        }
        const ip = request.headers["x-real-ip"] || request.socket.remoteAddress || "unknown";
        if (!httpRateLimits.take(`${ip}:${url.pathname}`)) {
          sendJson(response, 429, { error: "rate_limited" }, corsHeaders || {});
          return;
        }
      }
      if (request.method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, {
          ok: true,
          service: "webdrop-signaling",
          uptimeSeconds: Math.round(process.uptime()),
          time: new Date().toISOString()
        }, corsHeaders || {});
        return;
      }

      if (request.method === "GET" && url.pathname === "/readyz") {
        sendJson(response, 200, {
          ok: true,
          service: "webdrop-signaling",
          environment: environmentStatus.environment,
          allowedOrigins: environmentStatus.allowedOrigins,
          turnConfigured: environmentStatus.turnConfigured,
          turnFallbackAllowed: environmentStatus.turnFallbackAllowed,
          turnAuthRequired: environmentStatus.turnAuthRequired,
          proximityAnalysisEnabled: proximityAnalyzer.enabled
        }, corsHeaders || {});
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/ice-servers") {
        const clientId = url.searchParams.get("clientId") || undefined;
        if (env.REQUIRE_TURN_AUTH !== "false") {
          const token = bearerToken(request.headers.authorization);
          if (!hub?.authenticateTurnRequest(token, clientId)) {
            sendJson(response, 401, { error: "unauthorized" }, corsHeaders || {});
            return;
          }
        }
        const customIdentifier = clientId || url.searchParams.get("sessionId") || undefined;
        const iceServers = await turnProvider.getIceServers({ customIdentifier });
        sendJson(response, 200, {
          iceServers,
          relayPolicy: turnProvider.getRelayPolicy()
        }, {
          "Cache-Control": "no-store",
          ...(corsHeaders || {})
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/relay-policy") {
        sendJson(response, 200, turnProvider.getRelayPolicy(), {
          "Cache-Control": "no-store",
          ...(corsHeaders || {})
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/proximity-policy") {
        sendJson(response, 200, {
          proximity: proximityAnalyzer.policy(),
          permissions: permissionPolicy.getPolicy()
        }, {
          "Cache-Control": "no-store",
          ...(corsHeaders || {})
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/metrics-summary" && env.ENABLE_METRICS_ENDPOINT === "true") {
        if (!hasMetricsAuthorization(request, env.METRICS_API_TOKEN)) {
          sendJson(response, 401, { error: "unauthorized" }, corsHeaders || {});
          return;
        }
        sendJson(response, 200, metrics.summary({
          activeClients: hub?.clients.size || 0,
          activePairs: hub?.activePairs.size || 0
        }), {
          "Cache-Control": "no-store",
          ...(corsHeaders || {})
        });
        return;
      }

      sendJson(response, 404, {
        error: "not_found"
      }, url.pathname.startsWith("/api/") ? corsHeaders || {} : {});
    } catch (error) {
      providedLogger.error("HTTP request failed.", { message: error.message });
      sendJson(response, 500, {
        error: "internal_error"
      }, allowedOriginHeaders(request.headers.origin, allowedOrigins) || {});
    }
  });

  let hub;
  hub = new SignalingHub({
    server,
    logger: providedLogger,
    maxJsonBytes,
    heartbeatIntervalMs: parsePositiveInt(env.HEARTBEAT_INTERVAL_MS, 25000),
    sessionTtlMs: parsePositiveInt(env.SESSION_TTL_MS, 900000),
    pairingTtlMs: parsePositiveInt(env.PAIRING_TTL_MS, 120000),
    proximityAnalyzer,
    qrTokenProvider,
    metrics
  });
  hub.setAllowedOrigins(allowedOrigins);

  return { server, hub, turnProvider, proximityAnalyzer, permissionPolicy, qrTokenProvider, metrics };
}

export function startServer({ env = process.env } = {}) {
  const host = env.HOST || "127.0.0.1";
  const port = parsePositiveInt(env.PORT, 8080);
  const { server, hub } = createWebDropServer({ env });

  server.listen(port, host, () => {
    logger.info("WebDrop signaling server listening.", {
      host,
      port,
      ws: "/ws"
    });
  });

  const shutdown = () => {
    logger.info("Shutting down WebDrop signaling server.");
    hub.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return { server, hub };
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "microphone=(), camera=(), accelerometer=(), gyroscope=(), magnetometer=()",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function parsePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function parseAllowedOrigins(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function validateServerEnvironment(env = process.env) {
  const environment = env.NODE_ENV || "development";
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const turnConfigured = Boolean(env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN);
  const turnFallbackAllowed = env.ALLOW_STUN_FALLBACK !== "false";
  const turnAuthRequired = env.REQUIRE_TURN_AUTH !== "false";

  if (environment === "production") {
    if (allowedOrigins.length === 0) {
      throw new Error("ALLOWED_ORIGINS is required when NODE_ENV=production.");
    }
    if (allowedOrigins.includes("*")) {
      throw new Error("ALLOWED_ORIGINS cannot contain a wildcard in production.");
    }
    if (!turnAuthRequired) {
      throw new Error("REQUIRE_TURN_AUTH must remain enabled in production.");
    }
    if (!turnFallbackAllowed && !turnConfigured) {
      throw new Error("Cloudflare TURN credentials are required when STUN fallback is disabled.");
    }
    if (env.ENABLE_METRICS_ENDPOINT === "true" && isPlaceholderSecret(env.METRICS_API_TOKEN)) {
      throw new Error("A non-placeholder METRICS_API_TOKEN is required when metrics are enabled.");
    }
  }

  return {
    environment,
    allowedOrigins: allowedOrigins.length,
    turnConfigured,
    turnFallbackAllowed,
    turnAuthRequired
  };
}

function isPlaceholderSecret(value) {
  const text = String(value || "").trim();
  return !text || /^(replace|change|example|placeholder)/i.test(text);
}

function hasMetricsAuthorization(request, expectedToken) {
  if (!expectedToken) return false;
  return request.headers.authorization === `Bearer ${expectedToken}`;
}

function bearerToken(header) {
  return String(header || "").startsWith("Bearer ") ? String(header).slice(7) : "";
}

function allowedOriginHeaders(origin, allowedOrigins) {
  if (!origin) return {};
  if (allowedOrigins.length && !allowedOrigins.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin"
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer();
}

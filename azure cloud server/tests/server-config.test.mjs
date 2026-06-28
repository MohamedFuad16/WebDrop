import test from "node:test";
import assert from "node:assert/strict";
import { createWebDropServer, validateServerEnvironment } from "../src/server.js";

const productionEnv = {
  NODE_ENV: "production",
  ALLOWED_ORIGINS: "https://web-drop-lyart.vercel.app",
  REQUIRE_TURN_AUTH: "true",
  ALLOW_STUN_FALLBACK: "false",
  CLOUDFLARE_TURN_KEY_ID: "turn-key",
  CLOUDFLARE_TURN_API_TOKEN: "turn-token"
};

test("production environment reports safe readiness metadata", () => {
  assert.deepEqual(validateServerEnvironment(productionEnv), {
    environment: "production",
    allowedOrigins: 1,
    turnConfigured: true,
    turnFallbackAllowed: false,
    turnAuthRequired: true
  });
});

test("production rejects wildcard origins and disabled TURN authentication", () => {
  assert.throws(
    () => validateServerEnvironment({ ...productionEnv, ALLOWED_ORIGINS: "*" }),
    /cannot contain a wildcard/
  );
  assert.throws(
    () => validateServerEnvironment({ ...productionEnv, REQUIRE_TURN_AUTH: "false" }),
    /must remain enabled/
  );
});

test("production rejects missing TURN credentials when fallback is disabled", () => {
  assert.throws(
    () => validateServerEnvironment({
      ...productionEnv,
      CLOUDFLARE_TURN_API_TOKEN: ""
    }),
    /TURN credentials are required/
  );
});

test("enabled metrics require a non-placeholder token", () => {
  assert.throws(
    () => validateServerEnvironment({
      ...productionEnv,
      ENABLE_METRICS_ENDPOINT: "true",
      METRICS_API_TOKEN: "replace-with-random-observability-token"
    }),
    /non-placeholder METRICS_API_TOKEN/
  );
});

test("consolidated diagnostics endpoint rejects un-tokened reads and serves the bounded payload with the metrics token", async () => {
  const { server, hub } = createWebDropServer({
    env: {
      NODE_ENV: "test",
      ENABLE_METRICS_ENDPOINT: "true",
      METRICS_API_TOKEN: "test-observability-token",
      REQUIRE_TURN_AUTH: "false"
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    // No bearer token: the once-public diagnostics route now demands the same
    // metrics token family as /api/metrics-summary.
    const unauthorized = await fetch(`${base}/api/diagnostics-public`);
    assert.equal(unauthorized.status, 401);
    const unauthorizedBody = await unauthorized.json();
    assert.equal(unauthorizedBody.error, "unauthorized");

    const wrongToken = await fetch(`${base}/api/diagnostics-public`, {
      headers: { Authorization: "Bearer not-the-token" }
    });
    assert.equal(wrongToken.status, 401);

    // The legacy duplicate endpoint is gone; both names used to return the same
    // shape, so only one authed route remains.
    const retiredSnapshot = await fetch(`${base}/api/diagnostics-snapshot`, {
      headers: { Authorization: "Bearer test-observability-token" }
    });
    assert.equal(retiredSnapshot.status, 404);

    // Valid token from any source IP: bounded, metadata-only payload.
    const authorized = await fetch(`${base}/api/diagnostics-public`, {
      headers: { Authorization: "Bearer test-observability-token" }
    });
    assert.equal(authorized.status, 200);
    const body = await authorized.json();
    assert.deepEqual(body.signaling.clients, []);
    assert.deepEqual(body.signaling.pairs, []);
    assert.deepEqual(body.signaling.proximitySessions, []);
    assert.equal(body.signaling.protocol.scoreMinimum, 0.55);
    assert.equal(body.signaling.protocol.maxClients, 6);
    assert.equal(body.signaling.protocol.acousticSlotCorrelationMin, 0.2);
    assert.equal(body.signaling.protocol.acousticBandStartHz, 18600);
    assert.equal(body.signaling.protocol.acousticBandEndHz, 19400);
    assert.ok(Array.isArray(body.metrics.recentEvents));
  } finally {
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("per-IP HTTP rate limiting rejects a burst on /api endpoints", async () => {
  const { server, hub } = createWebDropServer({
    env: { NODE_ENV: "test", REQUIRE_TURN_AUTH: "false" },
    logger: { info() {}, warn() {}, error() {} }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const responses = await Promise.all(
      Array.from({ length: 80 }, () => fetch(`${base}/api/relay-policy`))
    );
    const statuses = responses.map((response) => response.status);
    await Promise.all(responses.map((response) => response.body?.cancel?.()));
    assert.ok(statuses.includes(429), "expected at least one rate-limited response");
    assert.ok(statuses.includes(200), "expected at least one allowed response");
  } finally {
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("diagnostics endpoint is gated by ENABLE_METRICS_ENDPOINT", async () => {
  const { server, hub } = createWebDropServer({
    env: {
      NODE_ENV: "test",
      ENABLE_METRICS_ENDPOINT: "false",
      METRICS_API_TOKEN: "test-observability-token",
      REQUIRE_TURN_AUTH: "false"
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    // With metrics disabled the diagnostics feed is not mounted at all, even
    // with a valid token, so the dashboard reports the route as undeployed.
    const withToken = await fetch(`${base}/api/diagnostics-public`, {
      headers: { Authorization: "Bearer test-observability-token" }
    });
    assert.equal(withToken.status, 404);

    const withoutToken = await fetch(`${base}/api/diagnostics-public`);
    assert.equal(withoutToken.status, 404);
  } finally {
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

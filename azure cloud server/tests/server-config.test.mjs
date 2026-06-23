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

test("diagnostics snapshot keeps private auth and exposes safe public status", async () => {
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
    const publicSnapshot = await fetch(`${base}/api/diagnostics-public`);
    assert.equal(publicSnapshot.status, 200);
    const publicBody = await publicSnapshot.json();
    assert.deepEqual(publicBody.signaling, {
      clients: [],
      pairs: [],
      proximitySessions: []
    });
    assert.ok(Array.isArray(publicBody.metrics.recentEvents));

    const unauthorized = await fetch(`${base}/api/diagnostics-snapshot`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${base}/api/diagnostics-snapshot`, {
      headers: { Authorization: "Bearer test-observability-token" }
    });
    assert.equal(authorized.status, 200);
    const body = await authorized.json();
    assert.deepEqual(body.signaling, {
      clients: [],
      pairs: [],
      proximitySessions: []
    });
    assert.ok(Array.isArray(body.metrics.recentEvents));
  } finally {
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("public diagnostics remain available when private metrics are disabled", async () => {
  const { server, hub } = createWebDropServer({
    env: {
      NODE_ENV: "test",
      ENABLE_METRICS_ENDPOINT: "false",
      REQUIRE_TURN_AUTH: "false"
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const publicSnapshot = await fetch(`${base}/api/diagnostics-public`);
    assert.equal(publicSnapshot.status, 200);

    const privateSnapshot = await fetch(`${base}/api/diagnostics-snapshot`);
    assert.equal(privateSnapshot.status, 404);
  } finally {
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

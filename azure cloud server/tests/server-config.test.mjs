import test from "node:test";
import assert from "node:assert/strict";
import { validateServerEnvironment } from "../src/server.js";

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

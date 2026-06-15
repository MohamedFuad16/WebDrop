import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebDropServer } from "../src/server.js";

test("production startup requires an explicit allowed origin list", () => {
  assert.throws(
    () => createWebDropServer({
      env: { NODE_ENV: "production" },
      logger: silentLogger()
    }),
    /ALLOWED_ORIGINS/
  );
});

test("metrics summary stays disabled unless explicitly enabled", async () => {
  const created = createWebDropServer({ env: {}, logger: silentLogger() });
  await listen(created.server);
  const baseUrl = address(created.server);
  const response = await fetch(`${baseUrl}/api/metrics-summary`);
  assert.equal(response.status, 404);
  await close(created);
});

test("enabled metrics summary requires its bearer token", async () => {
  const created = createWebDropServer({
    env: {
      ENABLE_METRICS_ENDPOINT: "true",
      METRICS_API_TOKEN: "test-metrics-token",
      ALLOWED_ORIGINS: "http://allowed.example"
    },
    logger: silentLogger()
  });
  await listen(created.server);
  const baseUrl = address(created.server);
  assert.equal((await fetch(`${baseUrl}/api/metrics-summary`)).status, 401);
  const response = await fetch(`${baseUrl}/api/metrics-summary`, {
    headers: {
      Origin: "http://allowed.example",
      Authorization: "Bearer test-metrics-token"
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://allowed.example");
  assert.equal(typeof (await response.json()).activeClients, "number");
  await close(created);
});

test("policy API responses include CORS only for allowed origins", async () => {
  const created = createWebDropServer({
    env: {
      ALLOWED_ORIGINS: "http://allowed.example"
    },
    logger: silentLogger()
  });
  await listen(created.server);
  const baseUrl = address(created.server);
  const proximity = await fetch(`${baseUrl}/api/proximity-policy`, {
    headers: { Origin: "http://allowed.example" }
  });
  assert.equal(proximity.status, 200);
  assert.equal(proximity.headers.get("access-control-allow-origin"), "http://allowed.example");

  const relay = await fetch(`${baseUrl}/api/relay-policy`, {
    headers: { Origin: "http://allowed.example" }
  });
  assert.equal(relay.status, 200);
  assert.equal(relay.headers.get("access-control-allow-origin"), "http://allowed.example");

  const disallowed = await fetch(`${baseUrl}/api/proximity-policy`, {
    headers: { Origin: "http://evil.example" }
  });
  assert.equal(disallowed.status, 403);
  await close(created);
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function address(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(created) {
  created.hub.close();
  await new Promise((resolve) => created.server.close(resolve));
}

function silentLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { TurnConfigProvider } from "../src/turn-provider.js";

test("returns Cloudflare iceServers without exposing long-term API token", async () => {
  const requests = [];
  const testToken = "test-token-not-real";
  const provider = new TurnConfigProvider({
    env: {
      CLOUDFLARE_TURN_KEY_ID: "turn-key-id",
      CLOUDFLARE_TURN_API_TOKEN: testToken,
      TURN_TTL_SECONDS: "120",
      TURN_CACHE_SECONDS: "0"
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({
        iceServers: [
          { urls: ["stun:stun.cloudflare.com:3478"] },
          {
            urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
            username: "temporary-user",
            credential: "temporary-credential"
          }
        ]
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    },
    logger: silentLogger()
  });

  const iceServers = await provider.getIceServers({ customIdentifier: "user@example.com/unsafe" });

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /turn-key-id\/credentials\/generate-ice-servers$/);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${testToken}`);
  assert.equal(JSON.parse(requests[0].options.body).ttl, 120);
  assert.equal(JSON.parse(requests[0].options.body).customIdentifier, "user-example.com-unsafe");
  assert.equal(iceServers[1].username, "temporary-user");
  assert.equal(JSON.stringify(iceServers).includes(testToken), false);
});

test("clamps invalid TURN TTL values and falls back to STUN when unconfigured", async () => {
  const provider = new TurnConfigProvider({
    env: {
      TURN_TTL_SECONDS: "999999999",
      ALLOW_STUN_FALLBACK: "true"
    },
    logger: silentLogger()
  });

  assert.equal(provider.getRelayPolicy().ttlSeconds, 172800);
  const iceServers = await provider.getIceServers();
  assert.match(iceServers[0].urls[0], /^stun:/);
});

function silentLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

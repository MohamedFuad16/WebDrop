import test from "node:test";
import assert from "node:assert/strict";
import { TurnConfigProvider } from "../src/turn-provider.js";

const baseEnv = {
  CLOUDFLARE_TURN_KEY_ID: "demo-key",
  CLOUDFLARE_TURN_API_TOKEN: "secret-token",
  TURN_TTL_SECONDS: "3600",
  TURN_CACHE_SECONDS: "30",
  ALLOW_STUN_FALLBACK: "true"
};

test("Cloudflare TURN credentials are requested server-side and cached briefly", async () => {
  const calls = [];
  const provider = new TurnConfigProvider({
    env: baseEnv,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        iceServers: [
          {
            urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
            username: "temporary-user",
            credential: "temporary-credential"
          }
        ]
      }, { status: 201 });
    }
  });

  const longIdentifier = `user/with spaces/${"x".repeat(80)}`;
  const first = await provider.getIceServers({ customIdentifier: longIdentifier });
  const second = await provider.getIceServers({ customIdentifier: longIdentifier });

  assert.equal(calls.length, 1);
  assert.equal(first, second);
  assert.match(calls[0].url, /\/demo-key\/credentials\/generate-ice-servers$/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    ttl: 3600,
    customIdentifier: "user-with-spaces-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  });
  assert.equal(JSON.parse(calls[0].options.body).customIdentifier.length, 64);
  assert.equal(first[0].username, "temporary-user");
});

test("TURN provider returns STUN fallback without logging credentials when Cloudflare fails", async () => {
  const errors = [];
  const provider = new TurnConfigProvider({
    env: baseEnv,
    logger: {
      error(message, meta) {
        errors.push({ message, meta });
      }
    },
    fetchImpl: async () => new Response("invalid token id", { status: 400 })
  });

  const iceServers = await provider.getIceServers({ customIdentifier: "client-a" });

  assert.deepEqual(iceServers, [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].meta.status, 400);
  assert.equal(errors[0].meta.bodyBytes, "invalid token id".length);
  assert.equal(JSON.stringify(errors).includes("secret-token"), false);
});

test("TURN provider throws instead of falling back when fallback is disabled", async () => {
  const provider = new TurnConfigProvider({
    env: {
      ...baseEnv,
      ALLOW_STUN_FALLBACK: "false"
    },
    fetchImpl: async () => new Response("bad request", { status: 400 })
  });

  await assert.rejects(
    provider.getIceServers({ customIdentifier: "client-a" }),
    /Cloudflare TURN credential request failed with 400/
  );
});

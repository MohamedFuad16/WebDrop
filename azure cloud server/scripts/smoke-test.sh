#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${SERVER_DIR}"

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
WS_URL="${WS_URL:-${BASE_URL/http:/ws:}/ws}"
ORIGIN="${ORIGIN:-}"
EXPECT_TURN="${EXPECT_TURN:-false}"
export BASE_URL WS_URL ORIGIN EXPECT_TURN

assert_json_endpoint() {
  local url="$1"
  local origin="$2"
  local assertion="$3"
  local response_file
  response_file="$(mktemp)"

  local status
  if [[ -n "$origin" ]]; then
    status="$(curl -sS -o "$response_file" -w '%{http_code}' -H "Origin: ${origin}" "$url")"
  else
    status="$(curl -sS -o "$response_file" -w '%{http_code}' "$url")"
  fi
  if [[ "$status" != "200" ]]; then
    echo "Request to ${url} failed with HTTP ${status}." >&2
    node -e '
      const fs = require("node:fs");
      const text = fs.readFileSync(process.argv[1], "utf8");
      try { console.error(JSON.parse(text)); } catch { console.error(text || "<empty response>"); }
    ' "$response_file"
    rm -f "$response_file"
    return 1
  fi

  node -e "
    const fs = require('node:fs');
    const body = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    if (!(${assertion})) process.exit(1);
    console.log(body);
  " "$response_file"
  rm -f "$response_file"
}

echo "Checking ${BASE_URL}/healthz"
assert_json_endpoint "${BASE_URL}/healthz" "" 'body.ok === true'

echo "Checking ${BASE_URL}/readyz"
assert_json_endpoint "${BASE_URL}/readyz" "" 'body.ok === true && body.turnAuthRequired === true'

echo "Checking ${BASE_URL}/api/proximity-policy"
assert_json_endpoint "${BASE_URL}/api/proximity-policy" "${ORIGIN}" 'typeof body.proximity?.enabled === "boolean"'

echo "Checking WebSocket upgrade and TURN credential proxy at ${WS_URL}"
node --input-type=module <<'NODE'
import WebSocket from "ws";
const wsUrl = process.env.WS_URL || process.argv[1];
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8080";
const origin = process.env.ORIGIN || "";
const websocketOptions = origin ? { headers: { Origin: origin } } : {};
const socket = new WebSocket(wsUrl, websocketOptions);
const timeout = setTimeout(() => {
  console.error("Timed out waiting for WebSocket response.");
  process.exit(1);
}, 3000);
socket.on("open", () => {
  socket.send(JSON.stringify({ type: "client:hello", payload: { self: { id: "smoke-client", deviceName: "Smoke Client" } } }));
});
socket.on("message", async (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === "connected") {
    try {
      const headers = {};
      if (origin) headers.Origin = origin;
      if (message.payload.turnAccessToken) headers.Authorization = `Bearer ${message.payload.turnAccessToken}`;
      const response = await fetch(`${baseUrl}/api/ice-servers?clientId=${encodeURIComponent(message.payload.id)}`, { headers });
      const body = await response.json();
      if (response.status !== 200 || !Array.isArray(body.iceServers)) {
        console.error({ status: response.status, body });
        process.exit(1);
      }
      const hasTurn = body.iceServers.some((entry) => {
        const urls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
        return urls.some((url) => typeof url === "string" && /^turns?:/i.test(url));
      });
      if (process.env.EXPECT_TURN === "true" && !hasTurn) {
        console.error("Expected managed TURN credentials, but the response contained STUN only.");
        process.exit(1);
      }
      clearTimeout(timeout);
      console.log({
        connected: true,
        id: message.payload.id,
        iceServers: body.iceServers.length,
        hasTurn,
        relayPolicy: body.relayPolicy
      });
      socket.close();
    } catch (error) {
      clearTimeout(timeout);
      console.error(error);
      process.exit(1);
    }
  }
});
socket.on("error", (error) => {
  clearTimeout(timeout);
  console.error(error.message);
  process.exit(1);
});
NODE

echo "Checking invite pairing and bidirectional chat routing at ${WS_URL}"
node --input-type=module <<'NODE'
import WebSocket from "ws";

const wsUrl = process.env.WS_URL || "ws://127.0.0.1:8080/ws";
const origin = process.env.ORIGIN || "";
const websocketOptions = origin ? { headers: { Origin: origin } } : {};
const suffix = Date.now().toString(36);

function connect(id, deviceName) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, websocketOptions);
    const messages = [];
    const timeout = setTimeout(() => reject(new Error(`${id} timed out connecting.`)), 5000);
    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "client:hello",
        payload: {
          self: { id, deviceName },
          capabilities: { chat: true, dataChannel: true }
        }
      }));
    });
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      messages.push(message);
      if (message.type === "connected") {
        clearTimeout(timeout);
        resolve({ id, socket, messages });
      }
    });
    socket.on("error", reject);
  });
}

function waitFor(client, predicate, label, timeoutMs = 7000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const found = client.messages.find(predicate);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${label}. Saw: ${client.messages.map((message) => message.type).join(", ")}`));
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

const sender = await connect(`smoke-chat-a-${suffix}`, "Smoke Chat A");
const receiver = await connect(`smoke-chat-b-${suffix}`, "Smoke Chat B");

sender.socket.send(JSON.stringify({ type: "invite", targetId: receiver.id }));
const invite = await waitFor(receiver, (message) => message.type === "invite" && message.payload?.fromId === sender.id, "invite");
receiver.socket.send(JSON.stringify({
  type: "invite:accept",
  targetId: sender.id,
  pairingId: invite.payload.pairingId
}));
const accepted = await waitFor(sender, (message) => message.type === "invite:accept" && message.payload?.pairingId === invite.payload.pairingId, "invite accept");
await waitFor(receiver, (message) => message.type === "invite:accept" && message.payload?.pairingId === invite.payload.pairingId, "invite accept echo");

sender.socket.send(JSON.stringify({
  type: "chat:message",
  targetId: receiver.id,
  pairingId: accepted.payload.pairingId,
  payload: { id: "smoke-chat-a", text: "hello from smoke A", createdAt: new Date().toISOString() }
}));
receiver.socket.send(JSON.stringify({
  type: "chat:message",
  targetId: sender.id,
  pairingId: accepted.payload.pairingId,
  payload: { id: "smoke-chat-b", text: "hello from smoke B", createdAt: new Date().toISOString() }
}));

await waitFor(receiver, (message) => message.type === "chat:message" && message.payload?.payload?.text === "hello from smoke A", "chat A to B");
await waitFor(sender, (message) => message.type === "chat:message" && message.payload?.payload?.text === "hello from smoke B", "chat B to A");

sender.socket.close();
receiver.socket.close();
console.log({ paired: true, chat: "bidirectional", pairingId: accepted.payload.pairingId });
NODE

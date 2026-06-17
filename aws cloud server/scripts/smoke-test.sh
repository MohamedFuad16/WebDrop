#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${SERVER_DIR}"

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
WS_URL="${WS_URL:-${BASE_URL/http:/ws:}/ws}"
ORIGIN="${ORIGIN:-}"
export BASE_URL WS_URL ORIGIN

echo "Checking ${BASE_URL}/healthz"
curl -fsS "${BASE_URL}/healthz" | node -e 'const chunks=[];process.stdin.on("data",c=>chunks.push(c));process.stdin.on("end",()=>{const body=JSON.parse(Buffer.concat(chunks)); if(!body.ok) process.exit(1); console.log(body);});'

echo "Checking ${BASE_URL}/api/proximity-policy"
curl -fsS ${ORIGIN:+-H "Origin: ${ORIGIN}"} "${BASE_URL}/api/proximity-policy" | node -e 'const chunks=[];process.stdin.on("data",c=>chunks.push(c));process.stdin.on("end",()=>{const body=JSON.parse(Buffer.concat(chunks)); if(typeof body.proximity?.enabled !== "boolean") process.exit(1); console.log({proximity: body.proximity.mode, permissions: body.permissions.mode});});'

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
      clearTimeout(timeout);
      console.log({
        connected: true,
        id: message.payload.id,
        iceServers: body.iceServers.length,
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

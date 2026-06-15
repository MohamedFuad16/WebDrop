#!/usr/bin/env bash
set -euo pipefail

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

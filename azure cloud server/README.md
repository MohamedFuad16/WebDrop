# WebDrop Azure Cloud Server

This folder is a self-contained first production-signaling package for WebDrop. It is designed to run on an Ubuntu Azure VM and sit behind nginx with Certbot-managed TLS.

No files outside `azure cloud server/` are required for this server package.

## What This Server Does

The server coordinates WebDrop peers. It does not transfer file bytes.

Allowed over WebSocket:

- presence and sanitized peer lists
- invite, accept, reject, and disconnect messages
- proximity telemetry summaries
- WebRTC offer, answer, and ICE candidate messages
- small chat messages
- multi-file transfer manifests and control messages

Not allowed over WebSocket:

- file chunks
- Blob payloads
- ArrayBuffer payloads
- binary frames
- large JSON payloads

File bytes should move browser-to-browser over an encrypted WebRTC `RTCDataChannel`. The signaling server only helps the two browsers find each other and agree on transport details.

## Why WebSocket Plus WebRTC

WebSocket is good for coordination because both browser and server can send small messages at any time. It is not the payload lane for WebDrop. WebSocket has no built-in backpressure strong enough for large file delivery, and routing file bytes through the server would raise server bandwidth, cost, privacy, and reliability risk.

WebRTC is the payload lane. Once the peers exchange offer/answer/candidates through the signaling server, the browser creates a direct or relayed peer connection. `RTCDataChannel` can send strings, `Blob`s, `ArrayBuffer`s, and typed array views. For WebDrop file transfer, the browser should slice each file into modest chunks, send chunk metadata, watch `bufferedAmount`, and reconstruct/export the file on the receiver.

## Network Lanes

```text
Browser static app over HTTPS
        |
        | small metadata only
        v
nginx TLS/WSS proxy on Azure VM
        |
        | /ws, /healthz, /readyz, /api/ice-servers
        v
Node signaling server on 127.0.0.1:8080
        |
        | temporary ICE credentials only
        v
Cloudflare TURN credential API

Peer A browser <==== encrypted WebRTC RTCDataChannel chunks ====>
Peer B browser        direct path first, Cloudflare TURN relay if needed
```

## Folder Layout

```text
azure cloud server/
|-- src/
|   |-- server.js
|   |-- signaling-hub.js
|   |-- turn-provider.js
|   |-- message-schema.js
|   |-- rate-limits.js
|   `-- logger.js
|-- nginx/
|   |-- nginx.conf.tuned
|   `-- webdrop-signaling.conf
|-- systemd/
|   `-- webdrop-signaling.service
|-- scripts/
|   |-- install-azure-ubuntu.sh
|   |-- deploy.sh
|   |-- certbot-init.sh
|   `-- smoke-test.sh
|-- config/
|   `-- mock-network.json
|-- load/
|   `-- artillery-websocket.yml
|-- .env.example
|-- .gitignore
|-- package.json
`-- README.md
```

## Protocol

Connect clients to:

```text
wss://signal.webdrop.example.com/ws
```

The first client message must be:

```json
{
  "type": "client:hello",
  "payload": {
    "self": {
      "id": "device-id",
      "deviceName": "WebDrop Device",
      "avatarId": "user-1",
      "ringColor": "#ffffff"
    },
    "capabilities": {
      "webRtc": true,
      "storage": "stream-download"
    }
  }
}
```

The server responds with:

```json
{ "type": "connected", "payload": { "mode": "wss", "id": "device-id" } }
```

Routed messages include `targetId` and optional `pairingId`:

```json
{
  "type": "rtc:signal",
  "targetId": "peer-id",
  "pairingId": "pair-peer-id-device-id",
  "signal": {
    "type": "offer",
    "sdp": "..."
  }
}
```

Supported routed types:

- `invite`
- `invite:accept`
- `invite:reject`
- `proximity:ready`
- `proximity:telemetry`
- `proximity:qr:issue`
- `proximity:qr:verify`
- `rtc:signal`
- `rtc:path-metric`
- `chat:message`
- `transfer:manifest`
- `transfer:control`
- `peer:disconnect`

Hub-handled (not peer-routed) proximity-session and operator types:

- `proximity:session:join` / `proximity:session:telemetry` / `proximity:session:diagnostic` / `proximity:session:cancel` — the server-coordinated anonymous reservation-TDMA ceremony (see "Proximity Verification").
- `admin:monitor:start` / `admin:monitor:stop` / `admin:monitor:telemetry` — single-device acoustic diagnostics for the operator dashboard.

`rtc:signal`, `rtc:path-metric`, `chat:message`, `transfer:manifest`, and `transfer:control` are additionally proximity-gated when `ENABLE_PROXIMITY_ANALYSIS=true`: they are blocked until both peers in the pairing reach a `verified` decision.

## Chat Messages

Chat messages are small signaling metadata:

```json
{
  "type": "chat:message",
  "targetId": "peer-id",
  "pairingId": "pair-id",
  "payload": {
    "id": "chat-1",
    "text": "Ready to send?",
    "createdAt": "2026-06-15T00:00:00.000Z"
  }
}
```

The server limits chat text length and routes the message to the connected peer. This is enough for short pairing notes. Production chat history should be added later only if the product needs persistence.

## Multi-File Transfer Manifest

The transfer manifest tells the receiver what is coming over the `RTCDataChannel`. It does not contain file bytes:

```json
{
  "type": "transfer:manifest",
  "targetId": "peer-id",
  "pairingId": "pair-id",
  "payload": {
    "transferId": "tx-1",
    "totalBytes": 2500000,
    "chunkSize": 262144,
    "files": [
      {
        "id": "file-1",
        "name": "demo.pdf",
        "type": "application/pdf",
        "size": 2500000,
        "chunks": 10,
        "lastModified": 1781443265000
      }
    ]
  }
}
```

The actual file path should be:

1. Sender chooses files in the browser.
2. Sender creates a manifest and routes it over WebSocket.
3. Sender slices each `Blob` into chunks.
4. Sender converts chunks to `ArrayBuffer` or sends supported binary chunks over `RTCDataChannel`.
5. Receiver persists incoming chunks into the app's deferred receive storage while the transfer is active, without prompting the browser download UI.
6. When the user taps Save in the receive sheet, WebDrop exports through a browser download stream where supported, or through the size-limited Blob fallback on browsers such as iOS Safari.

The active app caps each send session and each receive session at 500 MB. Save/export still depends on browser download behavior; normal web pages cannot silently choose an arbitrary filesystem path or reopen an OS Downloads file after the browser has released it.

## Proximity Verification

The production backend analyzes proximity telemetry and enforces a verified decision before transfer signaling is allowed.

```text
ENABLE_PROXIMITY_ANALYSIS=true
```

Policy endpoint:

```text
GET /api/proximity-policy
```

The response reports:

- proximity scoring mode is `analysis` when `ENABLE_PROXIMITY_ANALYSIS=true` (the live default) and `report-only` when it is disabled
- microphone, motion, camera, and QR checks are client-side ceremonies
- the server never requests browser permissions
- when analysis is enabled, RTC/chat/path/transfer routing is gated until a `verified` decision; when disabled, connection acceptance is not gated by the score
- Node and nginx emit `Permissions-Policy` headers that keep microphone, camera, accelerometer, gyroscope, and magnetometer off by default

### Concurrent bounded cohorts (capacity model)

The server-coordinated ceremony runs MANY concurrent proximity sessions, each kept a SMALL acoustic cohort so per-session time slots stay reliable (`openProximitySessionIds` in `src/signaling-hub.js`):

- `MAX_TOTAL_PROXIMITY_PARTICIPANTS` (default **100**): global cap across all concurrent cohorts. Joins beyond it are rejected cleanly with `proximity:session:failed` and `reason: "capacity_reached"`.
- `MAX_PROXIMITY_SESSION_CLIENTS` (default 6): per-cohort cap, **clamped** to the slot-floor ceiling derived from the ceremony window. A coded chirp needs ~520 ms + 80 ms guard (~600 ms floor), so the 3,600 ms `PROXIMITY_SESSION_DURATION_MS` window fits ~6 slots. Raising the cap higher has no effect unless the window grows.
- `ACOUSTIC_SESSION_STAGGER_MS` / `ACOUSTIC_SESSION_STAGGER_PHASES`: spread cohorts that fill at the same instant across start-time phases so they do not all chirp at once.
- `ACOUSTIC_MAX_CONCURRENT_SUBBANDS` (+ `ACOUSTIC_BAND_START_HZ`/`ACOUSTIC_BAND_END_HZ`): pin concurrent cohorts to different frequency lanes when the usable band is wide enough (a no-op at the default 18.6–19.4 kHz band, where only one ≥420 Hz lane fits).

`proximity:session:start` carries additive `acousticBandIndex` / `acousticBandCount` fields describing the cohort's assigned lane.

So 100 participants ≈ 17 concurrent 6-person cohorts ≈ up to ~50 simultaneous pairs. The software allows this; whether ~50 co-located pairs sharing one ~800 Hz band in one room reliably hear each other is an empirical, physical-device question — calibrate it. The scoring/scheduling detail is in `../docs/webdrop-proximity-scoring-and-tdma.md`.

Telemetry can be routed today:

```json
{
  "type": "proximity:telemetry",
  "targetId": "peer-id",
  "metrics": {
    "soundCorrelation": 0.91,
    "motionCorrelation": 0.73,
    "bumpCorrelation": 0.68,
    "tiltMatch": 0.5,
    "qrMatch": false
  }
}
```

Paired clients send `proximity:ready` after browser permissions are resolved. When both are ready, the server returns the same future `proximity:start` timestamp and ceremony duration to both devices.

When `ENABLE_PROXIMITY_ANALYSIS=true`, the server normalizes sound, motion, bump, tilt, and QR signals into a score and attaches analysis metadata to routed telemetry. RTC signaling, chat, path metrics, and transfer metadata remain blocked until both peers receive a `verified` decision.

Browser permission requests must still happen only in frontend UI after explicit user gestures. The backend only publishes the readiness policy.

## Cloudflare TURN

Endpoint:

```text
GET /api/ice-servers?clientId=<client-id>
Authorization: Bearer <ephemeral-token-from-connected-event>
```

The server calls Cloudflare:

```text
POST https://rtc.live.cloudflare.com/v1/turn/keys/$CLOUDFLARE_TURN_KEY_ID/credentials/generate-ice-servers
Authorization: Bearer $CLOUDFLARE_TURN_API_TOKEN
Content-Type: application/json
```

Response shape returned to the browser:

```json
{
  "iceServers": [
    { "urls": ["stun:stun.cloudflare.com:3478"] },
    {
      "urls": ["turn:turn.cloudflare.com:3478?transport=udp"],
      "username": "temporary-user",
      "credential": "temporary-password"
    }
  ],
  "relayPolicy": {
    "relayLimitBytes": 524288000,
    "ttlSeconds": 86400
  }
}
```

Do not expose the long-term Cloudflare TURN API token in frontend code. Store it only on Azure VM in `/etc/webdrop/signaling.env`.
The browser receives a separate ephemeral TURN access token only after `client:hello` succeeds. nginx and Node allow the configured frontend origin, while `/api/ice-servers` rejects requests that are not tied to that live signaling session. Keep `REQUIRE_TURN_AUTH=true` outside isolated local tests.

The token pasted into the planning chat should be rotated before real deployment. Put the rotated token in the Azure VM env file, not in Git.

Cloudflare notes that TURN is usually enough for one-to-one WebRTC communication. STUN is free and unlimited. TURN has a 1,000 GB monthly free tier, then usage is charged on egress from Cloudflare to TURN clients.

## Operations Diagnostics

The operator dashboard (`admin/index.html`, driven by `js/admin/readiness.js` via `js/admin/diagnostics-api.js`) reads bounded operational metadata from a single authenticated endpoint:

```text
GET /api/diagnostics-public
Authorization: Bearer <METRICS_API_TOKEN>
```

- This route now **always** requires the `METRICS_API_TOKEN` bearer (the same token as `/api/metrics-summary`). The previously separate, identically-shaped `/api/diagnostics-snapshot` route was consolidated into it; do not reintroduce an unauthenticated diagnostics route.
- There is intentionally **no IP allowlist**: any source address may read it *with* a valid token.
- The payload is metadata-only — connected-client summaries, active pairs, proximity-session/cohort state, protocol thresholds, bounded device acoustic telemetry, and recent events. It never exposes TURN credentials, QR tokens, raw microphone samples, or file bytes.
- On the operator's machine the dashboard auto-fills the token from the gitignored frontend file `js/config/local-admin-token.js`; remote operators paste it once (kept only in `sessionStorage`). Keep that value reconciled with `azure cloud server/.env` and the VM's `/etc/webdrop/signaling.env`.

## Environment

Copy `.env.example` to `/etc/webdrop/signaling.env` on Azure VM and edit values:

```bash
sudo install -d -m 0750 /etc/webdrop
sudo cp ".env.example" /etc/webdrop/signaling.env
sudo nano /etc/webdrop/signaling.env
```

Important variables:

- `HOST=127.0.0.1`
- `PORT=8080`
- `PUBLIC_ORIGIN=https://signal.webdrop.example.com`
- `ALLOWED_ORIGINS=https://web-drop-lyart.vercel.app,https://webdrop.example.com`
- `MAX_JSON_BYTES=65536` (also enforced at the `ws` protocol layer via `maxPayload`)
- `ENABLE_PROXIMITY_ANALYSIS=true`
- `CLOUDFLARE_TURN_KEY_ID=<turn-token-id>`
- `CLOUDFLARE_TURN_API_TOKEN=<turn-api-token>`
- `TURN_TTL_SECONDS=86400`
- `ALLOW_STUN_FALLBACK=true`

Proximity-pairing capacity + acoustic cohort tuning (optional; unset uses safe defaults):

- `MAX_TOTAL_PROXIMITY_PARTICIPANTS=100` (global cap; `capacity_reached` beyond it)
- `MAX_PROXIMITY_SESSION_CLIENTS=6` (per-cohort cap, clamped to the slot-floor ceiling)
- `PROXIMITY_SESSION_JOIN_WINDOW_MS=1800`, `PROXIMITY_SESSION_START_DELAY_MS=1200`, `PROXIMITY_SESSION_DURATION_MS=3600`, `PROXIMITY_SESSION_TTL_MS=15000`, `PROXIMITY_SESSION_MATCH_SLOP_MS=4000`
- `ACOUSTIC_BAND_START_HZ=18600`, `ACOUSTIC_BAND_END_HZ=19400`, `ACOUSTIC_MIN_BANDWIDTH_HZ=420`
- `ACOUSTIC_SESSION_STAGGER_MS=600`, `ACOUSTIC_SESSION_STAGGER_PHASES=3`, `ACOUSTIC_MAX_CONCURRENT_SUBBANDS=4`

Operations diagnostics + metrics (both endpoints require the same bearer token):

- `ENABLE_METRICS_ENDPOINT=true`
- `METRICS_API_TOKEN=<strong-random-token>` (e.g. `openssl rand -base64 32`; production startup rejects a placeholder value when metrics are enabled)

## Local Development

```bash
cd "azure cloud server"
npm install
npm run check
npm test # validates message schemas and Cloudflare TURN credential handling
npm start
```

Smoke test:

```bash
BASE_URL=http://127.0.0.1:8080 bash scripts/smoke-test.sh
```

## Azure VM Deployment

Recommended first VM:

- Ubuntu 24.04 LTS
- Small burstable VM only for a private smoke test
- 2 vCPU / 4 GiB VM for a small hosted beta
- 2 vCPU / 8 GiB VM or larger as the minimum serious single-node 10,000-client load-test candidate
- Prefer non-burstable general-purpose compute when signaling traffic becomes sustained
- Network security group inbound: `80/tcp`, `443/tcp`, SSH from your IP only
- DNS `A` record pointing `signal.webdrop.example.com` to the Azure VM public IP

These are starting points, not guaranteed capacity. See `../docs/deployment-sizing.md` for the current sizing rationale and load-test requirements.

Install base packages:

```bash
sudo bash scripts/install-azure-ubuntu.sh
```

Copy the folder to the server, then deploy. If certificates do not exist yet, this installs an HTTP bootstrap vhost so nginx can start and Certbot can complete:

```bash
sudo DOMAIN=signal.example.com bash scripts/deploy.sh
```

Issue TLS certificate:

```bash
sudo DOMAIN=signal.example.com EMAIL=you@example.com bash scripts/certbot-init.sh
```

Run deploy again after Certbot to reinstall the full TLS/WSS vhost from this folder:

```bash
sudo DOMAIN=signal.example.com bash scripts/deploy.sh
```

Verify:

```bash
curl -fsS https://signal.example.com/healthz
curl -fsS https://signal.example.com/readyz
BASE_URL=https://signal.example.com WS_URL=wss://signal.example.com/ws ORIGIN=https://web-drop-lyart.vercel.app EXPECT_TURN=true bash scripts/smoke-test.sh
```

From an authenticated operator Mac, the VM can be started, readiness-checked, or deallocated without remembering the Azure resource names:

```bash
bash scripts/azure-vm-start.sh
bash scripts/azure-vm-stop.sh
```

`azure-vm-start.sh` waits for the public `/readyz` endpoint and prints an Azure Run Command diagnostic when the VM starts but nginx or Node does not become ready.

## nginx 10,000-User Readiness

nginx default `worker_connections` is low for this use case. It also counts upstream/proxied connections, not just public clients. A proxied WebSocket can consume a client-side connection plus an upstream connection to Node.

This package includes:

- `worker_processes auto`
- `worker_connections 65535`
- `worker_rlimit_nofile 200000`
- systemd `LimitNOFILE=200000`
- `/etc/security/limits.d/webdrop.conf` entries for `webdrop` and `www-data`
- `/etc/sysctl.d/99-webdrop-signaling.conf` TCP/file descriptor headroom

This gives headroom above 10,000 concurrent users on a correctly sized instance. The exact limit still depends on Azure VM size, kernel settings, memory, TLS cost, network bandwidth, Node event loop load, and browser heartbeat intervals.

nginx's documented default is only `512` connections per worker. The nginx limit includes proxied upstream connections, so a WebSocket proxy consumes more than one nginx connection slot. Never treat `worker_connections 65535` as proof of application capacity; prove the target on the chosen Azure VM instance.

For real production scale, add:

- staged load testing
- Azure Monitor metrics and alerts
- process supervision metrics
- autoscaling or multiple signaling nodes
- Redis/shared presence if more than one Node process is used
- sticky or session-routed WebSocket balancing

## Load Testing

The sample Artillery file is intentionally conservative for the first run:

```bash
npx artillery run load/artillery-websocket.yml
```

Start below 10,000 and increase gradually while watching:

- `systemctl status webdrop-signaling`
- `journalctl -u webdrop-signaling -f`
- `nginx` active connections
- CPU and memory
- file descriptors
- network throughput

## Operational Notes

- Keep TLS termination at nginx.
- Keep Node bound to `127.0.0.1`.
- Do not log `iceServers`, TURN credentials, bearer tokens, or `sdp` (the logger redacts these keys automatically).
- Do not route files through WebSocket. The `ws` server enforces `maxPayload = MAX_JSON_BYTES`, so oversized/binary frames are rejected before buffering.
- The frontend `RTCDataChannel` uses 256 KiB chunks and watches `RTCDataChannel.bufferedAmount` for backpressure; the server is not involved in chunking.
- Resource-leak hardening to preserve: the per-IP HTTP rate-limit map is swept, the TURN credential cache is pruned/capped, peer broadcast is O(n), TURN-token auth is O(1), and proximity-session timers are cleared on shutdown.
- Treat the first Azure VM deployment as a hosted signaling test, not the final production architecture.

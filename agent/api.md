# API & Protocols

Three interfaces: (1) the **WebSocket signaling protocol**, (2) the **WebRTC data-channel transfer protocol**, (3) the **HTTP endpoints** on the signaling server. No secrets here — see `secrets.md`.

## 1. WebSocket signaling protocol (control plane)
Client side: `js/services/websocket-signaling.js`. Server side: `azure cloud server/src/signaling-hub.js`; message validation in `azure cloud server/src/message-schema.js`. Transport: `wss://…/ws`, JSON text frames only (**binary frames are rejected** — file bytes go over WebRTC). Max JSON size ~64 KB.

**Handshake:** first client frame must be `client:hello` with `{ payload: { self:{id,deviceId,deviceName,avatarId,deviceFamily,…}, capabilities } }`. Server replies `connected` (carrying a `turnAccessToken`). Client then heartbeats `client:ping` every ~20 s and auto-reconnects with exponential backoff.

**Client → server (sent by the adapter):**
| Type | Purpose |
|---|---|
| `client:hello`, `client:ping` | handshake / heartbeat |
| `invite`, `invite:accept`, `invite:reject` | pairing handshake (`targetId`, `pairingId`, `payload.method`=`proximity`\|`qr`) |
| `proximity:ready`, `proximity:telemetry` | per-peer ceremony sync + metrics |
| `proximity:session:join` / `:telemetry` / `:diagnostic` / `:cancel` | anonymous "who's nearby" cohort flow |
| `proximity:qr:issue`, `proximity:qr:verify` | QR token issue/verify (peer or peerless) |
| `proximity:fallback` | request QR fallback mid-ceremony |
| `rtc:signal` | relay SDP offer/answer + ICE candidates |
| `rtc:path-metric` | report negotiated path (direct/relay) + RTT |
| `chat:message` | text chat (≤2000 chars) |
| `transfer:manifest`, `transfer:control` | optional control-plane transfer mirror |
| `admin:monitor:start/stop/telemetry` | ops dashboard acoustic monitor |
| `peer:disconnect` | tear down a pairing |

**Server → client (emitted as adapter events):** `connected`, `disconnected`, `connection-failed`, `protocol:error`, `route:error`, `peers`, `invite`, `invite:accept`(→`inviteAccepted`), `invite:reject`/`inviteRejected`, `chat:message`, `rtc:signal`(→`rtcSignal`), `peer:disconnected`(→`peerDisconnected`), `proximity:decision`, `proximity:start`, `proximity:qr:issued`, `proximity:qr:verified`, `proximity:fallback`, `proximity:session:joined`/`:start`/`:match`/`:failed`, `admin:monitor:*`. Session/direct `proximity:start` payloads include a `tuning` snapshot (`revision`, `scoring`, `timing`) so browser and server score the same ceremony.

**`rtc:signal` shape:** `{ type:"offer"|"answer", sdp }` or `{ type:"candidate", candidate:{candidate,sdpMid,sdpMLineIndex,usernameFragment} }`. SDP is CRLF-normalized; size limits enforced (SDP ≤64 KB, candidate ≤4 KB).

**Proximity match outcome:** server returns `proximity:session:match` with `{ peerId, pairingId, peer }`, or `proximity:session:failed` with an authoritative `reason` (`acoustic_not_detected`, `bump_not_detected`, `tilt_not_detected`, `score_too_low`, `ambiguous_or_nonreciprocal_match`, `capacity_reached`, `cancelled`). The controller maps these to user-facing messages.

## 2. WebRTC data-channel transfer protocol (data plane)
File: `js/services/data-channel-transfer-protocol.js`. Two ordered channels created by the initiator:
- `webdrop-control-v1` — JSON control messages.
- `webdrop-file-v1` — interleaved JSON chunk **headers** followed by **binary** chunk payloads.

**Control messages (JSON on control channel):**
`transfer:manifest` → `transfer:ack`(stage `manifest`) → `transfer:ready` (receiver storage ready) → file chunks stream → `transfer:complete` → `transfer:ack`(stage `complete`). Plus `transfer:cancel`, `transfer:failed`, `transfer:retry`.

**Manifest:** `{ version:1, id, createdAt, totalBytes, files:[{id,name,size,type,lastModified,sha256}] }`. Each file's `sha256` is a 64-hex digest computed with the streaming hasher (`workers/incremental-sha256.js`). `totalBytes` must equal the sum of file sizes; invalid manifests are rejected.

**File chunk (file channel):** a JSON header `{ type:"file:chunk", transferId, fileId, sequence, offset, size, final }` immediately followed by one binary message of exactly `size` bytes. Default chunk size **256 KB**. Receiver enforces in-order offsets and requests `transfer:retry` on gaps/mismatches.

**Flow control / limits:** sender waits on `bufferedAmount` (high-water 8 MB, low-water 2 MB via `bufferedamountlow`). Session cap **500 MB**. Receiver-ready timeout 45 s; completion timeout 30 min. Completion only fires once `receivedBytes >= totalBytes`.

## 3. HTTP endpoints (signaling server)
Base: `https://webdrop-wss-0618.japaneast.cloudapp.azure.com` (see `js/config/runtime-config.js`). Routes in `azure cloud server/src/server.js`:
| Method/Path | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | liveness |
| `GET /readyz` | none | readiness (used by admin dashboard) |
| `GET /api/ice-servers` | Bearer | TURN/ICE config for WebRTC (`turn-config.js`) |
| `GET /api/relay-policy` | (per server) | relay byte limits |
| `GET /api/proximity-policy` | none | public scoring/permission metadata plus the current safe `tuning` snapshot |
| `PUT /api/proximity-policy` | Bearer | validate, persist, and apply scoring/timing for new sessions |
| `GET /api/metrics-summary` | Bearer | metrics (when enabled) |
| `GET /api/diagnostics-public` | Bearer | consolidated diagnostics feed for the admin dashboard |

## Auth flows (no secrets stored in frontend)
- **TURN/ICE:** `TurnConfigProvider.getRemoteConfig()` fetches `/api/ice-servers` with `Authorization: Bearer <turnAccessToken>`, where the token is brokered by the signaling server in the `connected` message (`signaling.getTurnAuthorization()`). 30 s cache. If unauthenticated/disabled it falls back to public Cloudflare STUN.
- **Admin/metrics:** the dashboard sends `Authorization: Bearer <METRICS_API_TOKEN>` to `/api/diagnostics-public`. On the operator's own machine the token auto-loads from the gitignored `js/config/local-admin-token.js`; remote operators paste it (kept only in `sessionStorage`). The same value lives in the server's `.env` (`METRICS_API_TOKEN`).
- **Cloudflare TURN credentials** (`CLOUDFLARE_TURN_KEY_ID` / `_API_TOKEN`) live **only on the server**, never in frontend code.

## External connectors
- **Signaling server** (`wss://…/ws`) — Node `ws` hub in `azure cloud server/`.
- **Cloudflare TURN/STUN** — `stun:stun.cloudflare.com` fallback; managed TURN via the server broker.
- **StreamSaver** service worker (`vendor/streamsaver/`) for large streamed downloads on non-iOS.

## Runtime proximity policy
`PUT /api/proximity-policy` accepts `{ scoring:{ minimum, weights:{ sound,motion,bump,tilt,qr } }, timing:{ lateTapGraceMs, acousticWindowMs, matchSlopMs } }`. Weights must total 100. Bounds: minimum 35–90, late-tap grace 2,000–15,000 ms, acoustic window 2,400–12,000 ms, and match slop 500–10,000 ms. A successful response returns the incremented policy revision and `updatedAt`; persistence is atomic. Existing sessions keep their snapshot, while the next session uses the update.

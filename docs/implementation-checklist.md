# WebDrop Production Implementation Checklist

Updated: June 19, 2026
App version: 1.0.65

This is the source of truth for the production-readiness package. `Ready, live` means the implementation is active in the current runtime. `Ready, disabled` means the implementation is wired to the frontend but cannot become effective unless its runtime flag and infrastructure are enabled. `Ready, unconfigured` means the code exists but requires deployment secrets or infrastructure. `External verification` means the code is ready but requires Azure, Cloudflare, or physical devices.

## Proximity and permissions

| Requirement | Status | Evidence |
|---|---|---|
| Real microphone permission request | Ready, live | `js/services/acoustic-proximity.js`, `js/core/controller.js`, `tests/proximity-engine.test.mjs` |
| Real Web Audio chirp generation | Ready, live | `js/services/acoustic-proximity.js`, `tests/proximity-engine.test.mjs` |
| Real chirp detection and normalized correlation | Ready, live | `js/services/acoustic-proximity.js`, `tests/proximity-engine.test.mjs` |
| Coordinated peerless chirp exchange | Ready, live | `js/services/proximity-engine.js`, `proximity:session:*` in Azure signaling |
| Live acoustic ceremony diagnostics | Ready, live | `js/services/proximity-engine.js`, `js/ui/dynamic-island.js`, `tests/proximity-engine.test.mjs` |
| Real tilt and bump capture | Ready, live | `js/services/motion-proximity.js`, `js/core/controller.js` |
| Permission ceremony from explicit Connect/Scan gesture | Ready, live | `js/core/controller.js`, `tests/e2e/app-ui.spec.mjs` |
| Reset old motion evidence and stop analyzer capture after ceremony | Ready, live | `js/services/proximity-engine.js`, `js/core/controller.js` |
| Send real proximity telemetry to Azure signaling | Ready, live | `js/services/websocket-signaling.js`, `js/core/controller.js` |
| Enforce proximity before RTC, chat, path metrics, or transfer metadata | Ready, live | `azure cloud server/src/signaling-hub.js`, `azure cloud server/tests/signaling-hub-proximity-session.test.mjs` |
| Backend QR one-time-token logic | Ready, live | `azure cloud server/src/qr-token-provider.js`, `azure cloud server/src/signaling-hub.js`, backend tests |
| QR frontend UI and scanner | Ready, live | `js/ui/dynamic-island.js`, `js/core/controller.js`, `tests/e2e/live-signaling-ui.spec.mjs` |
| Two-device over-air threshold calibration | External verification | Requires physical iOS/Android devices in quiet, ordinary, and noisy rooms |

## Client transfer

| Requirement | Status | Evidence |
|---|---|---|
| Real offer/answer creation | Ready, live | `js/services/webrtc-transport.js` |
| Route SDP and ICE through WebSocket | Ready, live | `js/services/webrtc-transport.js`, `js/services/websocket-signaling.js` |
| Exactly one offerer per accepted invite | Ready, live | `js/core/controller.js` |
| Receiver `ondatachannel` handling | Ready, live | `js/services/webrtc-transport.js` |
| Separate control and file channels | Ready, live | `js/services/data-channel-transfer-protocol.js` |
| 256 KiB chunks and `bufferedAmount` backpressure | Ready, live | `js/services/data-channel-transfer-protocol.js` |
| Transfer manifests and file IDs | Ready, live | `js/services/data-channel-transfer-protocol.js` |
| Sender-side incremental SHA-256 manifest hashes | Ready, live | `js/services/data-channel-transfer-protocol.js`, `workers/incremental-sha256.js` |
| Receiver ACKs and cancel messages | Ready, live | `js/services/data-channel-transfer-protocol.js` |
| Receiver Blob assembly before chunk ACK | Ready, live | `js/services/transfer-engine.js`, `js/storage/storage-client.js` |
| Per-file and total progress | Ready, live | `js/services/data-channel-transfer-protocol.js`, `js/core/controller.js` |
| Completion waits for receiver byte-count verification | Ready, live | `js/services/transfer-engine.js`, `js/services/data-channel-transfer-protocol.js`, `js/storage/storage-client.js` |
| Failure and retry-range controls | Ready, live | `js/services/data-channel-transfer-protocol.js` |
| Direct/relay path classification | Ready, live | `js/services/webrtc-transport.js` |
| Two-browser direct and TURN transfer | Ready, live | `tests/e2e/live-relay.spec.mjs`, live public WSS/TURN proof |

## Receive storage

| Requirement | Status | Evidence |
|---|---|---|
| Streamed browser download receive path | Ready, live | `js/storage/storage-client.js`, `vendor/streamsaver/` |
| Blob-backed receive fallback | Ready, live | `js/storage/storage-client.js`, `tests/storage-client.test.mjs` |
| Receive sheet saved/open states | Ready, live | `js/ui/app-view.js`, `js/core/controller.js` |
| 500 MB receive session cap | Ready, live | `js/storage/storage-client.js`, `js/services/data-channel-transfer-protocol.js` |
| 500 MB send session cap | Ready, live | `js/core/controller.js`, `js/services/data-channel-transfer-protocol.js` |
| Byte-count verification | Ready, live | `js/storage/storage-client.js` |
| Simultaneous send and receive over one peer connection | Ready, live | `js/services/data-channel-transfer-protocol.js`, local bidirectional protocol test |
| Legacy receive worker writer | Removed from active runtime | App no longer creates `workers/storage-worker.js`; received files defer into IndexedDB or capped Blob fallback until Save |
| Interrupted transfer resume | Future hardening | Interrupted browser download sessions must restart |

## Azure signaling backend

| Requirement | Status | Evidence |
|---|---|---|
| WebSocket signaling endpoint | Ready | `azure cloud server/src/server.js`, `azure cloud server/src/signaling-hub.js` |
| Reject WebSocket file bytes and oversized JSON | Ready | `azure cloud server/src/message-schema.js`, backend tests |
| Strict RTC, chat, transfer, proximity, and path schemas | Ready | `azure cloud server/src/message-schema.js` |
| Origin and rate-limit policy | Ready | `azure cloud server/src/server.js`, `azure cloud server/src/signaling-hub.js` |
| Ephemeral invites and pairing sessions | Ready | `azure cloud server/src/signaling-hub.js` |
| Coordinated proximity start and enforced verified state | Ready, live | `azure cloud server/src/signaling-hub.js`, `ENABLE_PROXIMITY_ANALYSIS=true` on live readiness |
| Server-issued QR one-time tokens | Ready | `azure cloud server/src/qr-token-provider.js` |
| Cloudflare temporary TURN credentials | Ready, live | `azure cloud server/src/turn-provider.js`, `azure cloud server/tests/turn-provider.test.mjs`, live relay E2E |
| Direct/relay path metrics | Ready, live | `azure cloud server/src/metrics.js`, `azure cloud server/src/signaling-hub.js` |
| Payload-safe observability | Ready, live | `azure cloud server/src/logger.js`, protected metrics endpoint |
| nginx, Certbot, systemd, Azure VM scripts, and load-test assets | Ready, unconfigured | `azure cloud server/nginx/`, `systemd/`, `scripts/`, `load/` |

## Runtime activation state

- `js/config/runtime-config.js` currently points at the live Japan East WSS/TURN endpoints.
- `js/config/runtime-flags.js` refuses to enable proximity, transfer, or QR unless production signaling is enabled with a valid production signaling URL.
- `azure cloud server/.env.example` remains conservative, but the live `/readyz` reports `proximityAnalysisEnabled:true`.
- The deployed frontend selects `WebSocketSignalingAdapter`, real proximity, real transfer, and peerless QR because production signaling is enabled. Local QA can explicitly select mock mode with `?runtime=mock`.
- Microphone, motion, and QR are requested only from explicit user actions: Connect, Use QR, or Scan QR.

## Verification evidence

- Root static check: `npm run check`
- Root test command: `npm test` — covers acoustic chirps, receive storage, and concurrent WebRTC responder setup
- Azure backend static check: `npm run check`
- Azure backend test command: `npm test` — covers strict message schemas, production environment validation, and the Cloudflare TURN credential provider
- Playwright command: `npm run test:e2e` — covers responsive UI, QR, WebKit iPhone permission flows, Dynamic Island geometry, acoustic sensor recognition, live signaling, bidirectional transfer, and forced relay behavior
- `git diff --check` — passing
- Browser smoke: production and local mobile app load, 393x852 viewport has no horizontal overflow, QR is machine-readable, Dynamic Island expands edge-to-edge from the top, and console warnings/errors are empty.

## Remaining before production launch

1. Run two-physical-device over-air proximity calibration with representative iPhones and Android devices; record emitted/listening/detected slot text, margin, bump, tilt, score, and false-positive/false-negative outcomes.
2. Verify direct and TURN file-transfer behavior on physical devices with representative files below and near the 500 MB cap.
3. Continue monitoring Japan East health, WSS, ICE, allowed origins, protected metrics access, TLS renewal, systemd restart behavior, and firewall rules on the live VM.
4. Load-test signaling toward the documented 10,000-client target.
5. Add stronger client identity authentication and shared state before horizontally scaling beyond one signaling instance.
6. Keep the regenerated English and Japanese screenshot inventories and PDF guides aligned with the current app version.

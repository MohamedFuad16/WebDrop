# WebDrop Production Implementation Checklist

Updated: June 16, 2026
App version: 1.0.34

This is the source of truth for the production-readiness package. `Ready, live` means the implementation is active in the current runtime. `Ready, disabled` means the implementation is wired to the frontend but cannot become effective unless its runtime flag and infrastructure are enabled. `Ready, unconfigured` means the code exists but requires deployment secrets or infrastructure. `External verification` means the code is ready but requires Azure, Cloudflare, or physical devices.

## Proximity and permissions

| Requirement | Status | Evidence |
|---|---|---|
| Real microphone permission request | Ready, disabled | `js/services/acoustic-proximity.js`, `js/core/controller.js` |
| Real Web Audio chirp generation | Ready, disabled | `js/services/acoustic-proximity.js` |
| Real chirp detection and normalized correlation | Ready, disabled | `js/services/acoustic-proximity.js` |
| Coordinated two-peer chirp exchange | Ready, disabled | `js/services/proximity-engine.js`, `proximity:ready` / `proximity:start` in Azure signaling |
| Real tilt and bump capture | Ready, disabled | `js/services/motion-proximity.js` |
| Permission ceremony from explicit swipe gesture | Ready, disabled | `js/core/controller.js` |
| Reset old motion evidence and stop microphone/motion after ceremony | Ready, disabled | `js/services/proximity-engine.js`, `js/core/controller.js` |
| Send real proximity telemetry to Azure signaling | Ready, disabled | `js/services/websocket-signaling.js`, `js/core/controller.js` |
| Enforce proximity before RTC, chat, path metrics, or transfer metadata | Ready, disabled | `azure cloud server/src/signaling-hub.js` |
| Backend QR one-time-token logic | Ready, disabled | `azure cloud server/src/qr-token-provider.js`, `azure cloud server/src/signaling-hub.js` |
| QR frontend UI and scanner | Ready, disabled | `js/ui/dynamic-island.js`, `js/core/controller.js`, `js/services/websocket-signaling.js` |
| Two-device threshold calibration | External verification | Requires physical iOS/Android devices |

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
| Two-browser direct and TURN transfer | External verification | Requires deployed WSS/TURN and two browsers |

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
| Coordinated proximity start and enforced verified state | Ready, disabled | `azure cloud server/src/signaling-hub.js`, `ENABLE_PROXIMITY_ANALYSIS=false` |
| Server-issued QR one-time tokens | Ready | `azure cloud server/src/qr-token-provider.js` |
| Cloudflare temporary TURN credentials | Ready, external verification | `azure cloud server/src/turn-provider.js`, `azure cloud server/tests/turn-provider.test.mjs` |
| Direct/relay path metrics | Ready, disabled | `azure cloud server/src/metrics.js`, `azure cloud server/src/signaling-hub.js` |
| Payload-safe observability | Ready, disabled | `azure cloud server/src/logger.js`, protected metrics endpoint |
| nginx, Certbot, systemd, Azure VM scripts, and load-test assets | Ready, unconfigured | `azure cloud server/nginx/`, `systemd/`, `scripts/`, `load/` |

## Runtime activation state

- `js/config/runtime-config.js` currently points at the live Japan East WSS/TURN endpoints.
- `js/config/runtime-flags.js` refuses to enable proximity, transfer, or QR unless production signaling is enabled with a valid production signaling URL.
- `azure cloud server/.env.example` ships with `ENABLE_PROXIMITY_ANALYSIS=false`.
- The deployed frontend selects `WebSocketSignalingAdapter` and real transfer because production signaling is enabled. Local QA can explicitly select mock mode with `?runtime=mock`.
- Microphone, motion, and QR remain disabled and are not requested by default.

## Verification evidence

- Root static check: `npm run check`
- Root test command: `npm test` — covers receive storage and concurrent WebRTC responder setup
- Azure backend static check: `npm run check`
- Azure backend test command: `npm test` — covers strict message schemas, production environment validation, and the Cloudflare TURN credential provider
- Playwright command: `npm run test:e2e` — covers responsive UI, localization, accessibility-relevant interactions, local signaling, bidirectional transfer, and forced relay behavior
- `git diff --check` — passing
- Browser smoke: desktop and 393x852 mobile app load, seven mock peers render, connection tray stays hidden before connection, peer sheet opens, and console warnings/errors are empty.

## Remaining before production launch

1. Restore and continuously verify the configured Japan East health, WSS, and ICE endpoints; they were unreachable during the June 18 audit.
2. Copy the locally validated Cloudflare TURN Server credentials only to the Azure VM environment file and repeat the proven forced-relay session through the public endpoint.
3. Verify production allowed origins, protected metrics access, TLS renewal, systemd restart behavior, and firewall rules on the live VM.
4. Enable proximity flags only in the staged order documented in `docs/production-activation.md`.
5. Run two-physical-device proximity calibration and direct/TURN file-transfer tests with representative files below and near the 500 MB cap.
6. Load-test signaling toward the documented 10,000-client target.
7. Add stronger client identity authentication and shared state before horizontally scaling beyond one signaling instance.
8. Keep the regenerated English and Japanese screenshot inventories and PDF guides aligned with the current app version.

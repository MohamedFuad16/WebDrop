# WebDrop Production Implementation Checklist

Updated: June 15, 2026
App version: 1.0.10

This is the source of truth for the production-readiness package. `Ready, disabled` means the implementation is wired to the frontend but cannot become effective unless `productionSignaling` is enabled with valid runtime URLs. `Ready, unconfigured` means the code exists but requires deployment secrets or infrastructure. `External verification` means the code is ready but requires AWS, Cloudflare, or physical devices.

## Proximity and permissions

| Requirement | Status | Evidence |
|---|---|---|
| Real microphone permission request | Ready, disabled | `js/services/acoustic-proximity.js`, `js/core/controller.js` |
| Real Web Audio chirp generation | Ready, disabled | `js/services/acoustic-proximity.js` |
| Real chirp detection and normalized correlation | Ready, disabled | `js/services/acoustic-proximity.js` |
| Coordinated two-peer chirp exchange | Ready, disabled | `js/services/proximity-engine.js`, `proximity:ready` / `proximity:start` in AWS signaling |
| Real tilt and bump capture | Ready, disabled | `js/services/motion-proximity.js` |
| Permission ceremony from explicit swipe gesture | Ready, disabled | `js/core/controller.js` |
| Reset old motion evidence and stop microphone/motion after ceremony | Ready, disabled | `js/services/proximity-engine.js`, `js/core/controller.js` |
| Send real proximity telemetry to AWS signaling | Ready, disabled | `js/services/websocket-signaling.js`, `js/core/controller.js` |
| Enforce proximity before RTC, chat, path metrics, or transfer metadata | Ready, disabled | `aws cloud server/src/signaling-hub.js` |
| Backend QR one-time-token logic | Ready, disabled | `aws cloud server/src/qr-token-provider.js`, `aws cloud server/src/signaling-hub.js` |
| QR frontend UI and scanner | Ready, disabled | `js/ui/dynamic-island.js`, `js/core/controller.js`, `js/services/websocket-signaling.js` |
| Two-device threshold calibration | External verification | Requires physical iOS/Android devices |

## Client transfer

| Requirement | Status | Evidence |
|---|---|---|
| Real offer/answer creation | Ready, disabled | `js/services/webrtc-transport.js` |
| Route SDP and ICE through WebSocket | Ready, disabled | `js/services/webrtc-transport.js`, `js/services/websocket-signaling.js` |
| Exactly one offerer per accepted invite | Ready, disabled | `js/core/controller.js` |
| Receiver `ondatachannel` handling | Ready, disabled | `js/services/webrtc-transport.js` |
| Separate control and file channels | Ready, disabled | `js/services/data-channel-transfer-protocol.js` |
| 64 KiB chunks and `bufferedAmount` backpressure | Ready, disabled | `js/services/data-channel-transfer-protocol.js` |
| Transfer manifests and file IDs | Ready, disabled | `js/services/data-channel-transfer-protocol.js` |
| Sender-side incremental SHA-256 manifest hashes | Ready, disabled | `js/services/data-channel-transfer-protocol.js`, `workers/incremental-sha256.js` |
| Receiver ACKs and cancel messages | Ready, disabled | `js/services/data-channel-transfer-protocol.js` |
| Receiver storage backpressure before chunk ACK | Ready, disabled | `js/services/data-channel-transfer-protocol.js`, `js/services/transfer-engine.js` |
| Per-file and total progress | Ready, disabled | `js/services/data-channel-transfer-protocol.js`, `js/core/controller.js` |
| Completion waits for receiver storage and hash verification | Ready, disabled | `js/services/transfer-engine.js`, `js/services/data-channel-transfer-protocol.js` |
| Failure and retry-range controls | Ready, disabled | `js/services/data-channel-transfer-protocol.js` |
| Direct/relay path classification | Ready, disabled | `js/services/webrtc-transport.js` |
| Two-browser direct and TURN transfer | External verification | Requires deployed WSS/TURN and two browsers |

## Receive storage

| Requirement | Status | Evidence |
|---|---|---|
| OPFS-first incremental writes | Ready, disabled | `workers/storage-worker.js` |
| Fall through from OPFS failure to IndexedDB/memory | Ready, disabled | `workers/storage-worker.js` |
| IndexedDB chunk fallback | Ready, disabled | `workers/storage-worker.js` |
| Memory fallback capped at 64 MiB | Ready, disabled | `workers/storage-worker.js` |
| Quota estimate before receive | Ready, disabled | `workers/storage-worker.js`, `js/services/transfer-engine.js` |
| Byte-count verification | Ready, disabled | `workers/storage-worker.js` |
| Incremental SHA-256 verification | Ready, disabled | `workers/incremental-sha256.js`, `workers/storage-worker.js` |
| Worker transfer lists for chunks | Ready, disabled | `js/storage/storage-client.js` |
| Export, abort, and cleanup commands | Ready, disabled | `workers/storage-worker.js`, `js/storage/storage-client.js` |
| Worker-restart transfer resume | Future hardening | Not required for first production transfer; partial sessions are not resumed |
| Large IndexedDB export UX above 64 MiB | Future hardening | Worker exposes chunked export; integrated UI currently opens whole-Blob exports |
| Real-browser OPFS/IndexedDB failure-path tests | External verification | Requires browser/device storage environments |

## AWS signaling backend

| Requirement | Status | Evidence |
|---|---|---|
| WebSocket signaling endpoint | Ready | `aws cloud server/src/server.js`, `aws cloud server/src/signaling-hub.js` |
| Reject WebSocket file bytes and oversized JSON | Ready | `aws cloud server/src/message-schema.js`, backend tests |
| Strict RTC, chat, transfer, proximity, and path schemas | Ready | `aws cloud server/src/message-schema.js` |
| Origin and rate-limit policy | Ready | `aws cloud server/src/server.js`, `aws cloud server/src/signaling-hub.js` |
| Ephemeral invites and pairing sessions | Ready | `aws cloud server/src/signaling-hub.js` |
| Coordinated proximity start and enforced verified state | Ready, disabled | `aws cloud server/src/signaling-hub.js`, `ENABLE_PROXIMITY_ANALYSIS=false` |
| Server-issued QR one-time tokens | Ready | `aws cloud server/src/qr-token-provider.js` |
| Cloudflare temporary TURN credentials | Ready, unconfigured | `aws cloud server/src/turn-provider.js` |
| Direct/relay path metrics | Ready, disabled | `aws cloud server/src/metrics.js`, `aws cloud server/src/signaling-hub.js` |
| Payload-safe observability | Ready, disabled | `aws cloud server/src/logger.js`, protected metrics endpoint |
| nginx, Certbot, systemd, EC2 scripts, and load-test assets | Ready, unconfigured | `aws cloud server/nginx/`, `systemd/`, `scripts/`, `load/` |

## Disabled-default proof

- `js/config/runtime-config.js` ships with `productionSignaling=false` and blank production URLs.
- `js/config/runtime-flags.js` refuses to enable proximity, transfer, or QR unless production signaling is enabled with a valid production signaling URL.
- `aws cloud server/.env.example` ships with `ENABLE_PROXIMITY_ANALYSIS=false`.
- Default app startup uses `MockSignalingAdapter` and does not request microphone or motion permissions.

## Verification evidence

- Root static check: `npm run check`
- Root test command: `npm test` — confirms no repository test files are shipped in this build
- AWS backend static check: `npm run check`
- AWS backend test command: `npm test` — confirms no AWS server test files are shipped in this build
- `git diff --check` — passing
- Browser smoke: desktop and 393x852 mobile app load, seven mock peers render, connection tray stays hidden before connection, peer sheet opens, and console warnings/errors are empty.

## Remaining before production launch

1. Deploy `aws cloud server/` to EC2 and configure DNS, nginx, Certbot, systemd, and firewall rules.
2. Rotate and configure valid Cloudflare TURN Server credentials only in the EC2 environment file.
3. Configure production allowed origins and protected metrics token.
4. Set real WSS and TURN endpoint URLs in `js/config/runtime-config.js`.
5. Enable flags in the staged order documented in `docs/production-activation.md`.
6. Run two-physical-device proximity calibration and direct/TURN file-transfer tests.
7. Load-test signaling toward the documented 10,000-client target.
8. Add stronger client identity authentication and shared state before horizontally scaling beyond one signaling instance.
9. Keep the regenerated English and Japanese screenshot inventories and PDF guides aligned with the current app version.

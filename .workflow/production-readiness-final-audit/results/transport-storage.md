# Transport, Storage, And Worker Audit

## Scope

- Lane: Production readiness audit lane 4.
- Files reviewed: `js/services/webrtc-transport.js`, `js/services/transfer-engine.js`, `js/services/data-channel-transfer-protocol.js`, `js/services/turn-config.js`, `js/services/websocket-signaling.js`, `js/services/mock-signaling.js`, `js/services/proximity-engine.js`, `js/services/acoustic-proximity.js`, `js/services/motion-proximity.js`, `js/services/proximity-token.js`, `js/services/capabilities.js`, `js/storage/storage-client.js`, `workers/storage-worker.js`, `workers/incremental-sha256.js`, and `test/production-readiness.test.js`.
- Navigation: `AGENTS.md` was not present in the checkout, so the user-provided graph-first instructions were treated as active. MCP Graphify appeared pointed at a different codebase. Local `graphify-out/graph.json` identified the `WebRtcTransport`, `TransferEngine`, `StorageClient`, `WebSocketSignalingAdapter`, and `storage-worker.js` neighborhood before targeted file reads.

## Findings And Fixes

- DataChannel chunk framing now rejects malformed chunk headers and requests a retry when a new file header arrives before the previous binary payload. This prevents silent header replacement and protects receiver offset accounting.
- DataChannel binary handling now accepts `Blob`, `ArrayBuffer`, and typed-array payloads while normalizing typed-array views to exact `ArrayBuffer` slices before size checks.
- `StorageClient.writeChunk(..., { transfer: true })` now copies sliced typed-array views to exact buffers before posting to the worker. This avoids detaching unrelated bytes from a larger backing buffer while still transferring chunk ownership for real receive writes.
- `storage-worker.js` cleanup now removes in-memory session state even if OPFS or IndexedDB deletion reports a cleanup error. Cleanup errors are returned in `cleanupErrors` instead of leaving stale active sessions behind.

## Audit Notes

- Production transfer remains disabled by default through runtime flags; `realTransfer` only becomes true when production signaling is enabled with a real signaling URL.
- TURN credentials are not hard-coded. `TurnConfigProvider` only fetches managed ICE/TURN config when enabled and an authenticated signaling token is available; otherwise it returns STUN-only defaults.
- WebSocket signaling remains coordination-only in the reviewed frontend flow. File bytes stay on WebRTC DataChannels and storage worker writes.
- Storage fallback order is OPFS, IndexedDB, then capped memory fallback. Worker responses preserve structured error codes for quota, hash, ordering, and size failures.

## Verification

- `npm test` passed: 18 tests, 18 pass.
- `npm run check` passed.
- Added regression coverage for orphaned DataChannel chunk headers and sliced typed-array transfer safety.

## Residual Risk

- Browser-level OPFS and real RTC behavior still need end-to-end QA in a production-like HTTPS deployment with configured signaling/TURN, because Node tests cannot exercise browser quota prompts, live ICE candidate selection, or real worker persistence APIs.

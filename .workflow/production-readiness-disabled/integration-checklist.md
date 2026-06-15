# Integration Checklist: production-readiness-disabled

## Production Checklist Audit

# Production Checklist Audit Result
Accepted:
- Every requested client-transfer item now has an implementation path.
- Every requested receive-storage item now has an implementation path.
- Every requested backend item now has an implementation path.
- QR backend logic exists while QR UI remains deferred.
- `docs/implementation-checklist.md` records ready, disabled, external-verification, and future-hardening status.
- `docs/production-activation.md` defines the remaining AWS-to-frontend activation sequence.
Remaining risk:
- EC2 deployment, DNS/TLS, rotated Cloudflare credentials, WSS/TURN endpoint configuration, physical-device calibration, two-browser transfer, and load testing are external work.
- Client identity authentication and shared multi-instance state remain production-scale hardening.
Verification:
- Root check and 10 tests passed.
- AWS backend check and 20 tests passed.
- Desktop and 393x852 browser smoke passed without console warnings/errors.

## Proximity Implementation

# Proximity Implementation Result
Accepted:
- Real `getUserMedia` microphone permission and Web Audio chirp generation/correlation.
- Real `DeviceMotionEvent` permission, tilt, and bump capture.
- Explicit swipe-gesture permission calls, coordinated `proximity:ready` / `proximity:start`, two-way chirp exchange, motion reset, and sensor cleanup.
- Actual sound correlation and motion evidence sent to the AWS signaling server.
- Verified-only backend enforcement before RTC, chat, path metrics, and transfer metadata.
- All frontend and backend proximity paths remain disabled by default.
Rejected or fixed from audit:
- Fixed the impossible local score by binding active pairing freshness and real detected chirp evidence.
- Fixed early chirp emission with a server-coordinated future start time.
- Fixed stale motion evidence and microphone tracks remaining active.
- Fixed backend acceptance of `review` as verified.
Remaining risk:
- Real iOS/Android acoustic timing and thresholds require physical-device calibration.
- QR UI remains intentionally deferred.
Verification:
- Frontend deterministic chirp/motion tests passed.
- Backend coordinated-start and enforced-gate integration test passed.

## Storage Worker Implementation

# Storage Worker Implementation Result
Accepted:
- OPFS-first incremental writes.
- IndexedDB fallback and 64 MiB capped memory fallback.
- OPFS create/write setup fallback to IndexedDB or memory.
- Quota checks, byte counts, incremental SHA-256 comparison, export, abort, cleanup, and transfer-list support.
- Receiver storage write is awaited before chunk ACK, limiting storage queue growth.
Rejected or fixed from audit:
- Fixed normal transfers lacking authoritative sender hashes.
- Fixed sender completion preceding durable storage verification.
- Fixed OPFS partial availability aborting instead of falling through.
- Fixed storage chunk index advancing before a successful write.
Remaining risk:
- Worker-restart resume is future hardening.
- Large IndexedDB export above 64 MiB exposes chunked worker APIs but needs a dedicated streaming UI.
- Real OPFS and IndexedDB failure modes require browser/device testing.
Verification:
- Receive persistence/finalize integration test passed.
- Static checks and root tests passed.

## Webrtc Transfer Implementation

# WebRTC and Transfer Implementation Result
Accepted:
- Offer/answer/ICE routing through production WebSocket signaling.
- Exactly one offerer based on accepted-invite role.
- Receiver `ondatachannel`, separate control/file channels, 64 KiB chunks, and `bufferedAmount` backpressure.
- Manifests, file IDs, incremental sender SHA-256, ACK, cancel, retry-range, progress, failure, and completion states.
- Sender completion waits for receiver storage finalization and hash verification.
- Production transfer cannot enable without a valid production signaling URL.
Rejected or fixed from audit:
- Fixed outgoing invite acceptance changing the controller out of verification mode.
- Fixed both peers creating offers.
- Fixed path metrics being read before the peer connection reaches connected state.
- Fixed sender success being displayed before receiver persistence verification.
Remaining risk:
- Real direct and TURN relay transfer interoperability and large-file stress require deployed endpoints and two browsers.
Verification:
- Frontend protocol test proves sender hashing and completion-ACK wait.
- Static checks and root tests passed.

## Integration Decisions

Accepted:

Rejected:

Conflicts:

Remaining risks:

Verification still needed:

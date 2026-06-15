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

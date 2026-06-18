# Physical Proximity Refresh Audit

## Symptoms
- Target-first bump flow reveals a peer name before the physical ceremony proves the peer.
- Multiple nearby users can make the selected peer stale or wrong.
- Score failures must not automatically fall back to QR.
- iPhone motion, microphone, audio output, and ultrasonic detection need one-gesture and repeated-attempt hardening.
- Siri wave must render on older iOS/WebKit without a vertical-line failure.
- Received file preview must not navigate away from the app tab.
- QR fallback must be explicit and reliable.

## Source of Truth
- Physical connection is verified only after reciprocal telemetry reaches the server and score is at least 55.
- QR is a manual fallback or manual connection path.
- Peer identity may be shown only after the server returns a verified match.


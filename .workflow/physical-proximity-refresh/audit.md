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

## BumpBurst V2 Audit

- The anonymous flow is time-slotted, but microphone detection currently starts
  and stops for each peer slot instead of retaining one ceremony recording.
- The server allocates only four fixed bands between 20.05 and 21.2 kHz, so a
  fifth participant is forced into another session and 44.1 kHz devices cannot
  reproduce the upper signatures safely.
- A single strongest signature is reported without a runner-up confidence
  margin, which is insufficient for rejecting ambiguous five-device rooms.
- The replacement uses continuous capture, guarded time-division transmission,
  shared-band coded signatures, offline matched filtering, and reciprocal graph
  matching. It does not use simultaneous unscheduled transmission.

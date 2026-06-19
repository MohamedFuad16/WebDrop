# Production Activation Guide

WebDrop's production signaling, real transfer, proximity ceremony, and QR pairing paths are enabled in the current static app configuration. The default app requests microphone and motion only after the user taps Connect, and camera only after the user explicitly chooses Scan QR. Local QA can still select the mock adapter explicitly with `?runtime=mock`.

## Activation order

Use this order whenever the live endpoint or feature flags are changed.

1. Deploy or update `azure cloud server/` on the Azure VM.
2. Configure DNS, nginx, Certbot, systemd, firewall rules, exact allowed origins, protected metrics token, and rotated valid Cloudflare TURN Server credentials.
3. Verify `https://<signal-domain>/healthz`, `https://<signal-domain>/readyz`, `wss://<signal-domain>/ws`, and `https://<signal-domain>/api/ice-servers`.
4. Keep `ENABLE_PROXIMITY_ANALYSIS=false` for the first signaling-only smoke test.
5. Verify the frontend URLs in `js/config/runtime-config.js`.
6. Keep production signaling and real transfer enabled only while the endpoint health checks pass; enable the real proximity ceremony afterward.
7. Keep `ENABLE_PROXIMITY_ANALYSIS=true` only while live telemetry, failure persistence, QR fallback, and two-device calibration remain healthy.

Use [deployment-sizing.md](deployment-sizing.md) before selecting an Azure VM size. A burstable 1-vCPU VM is suitable for smoke testing, not the documented 10,000-client goal. Start serious single-node load testing with at least 2 vCPUs and 8 GiB of memory, then select the final Azure VM size from measured CPU, memory, file-descriptor, and network results.

## Frontend configuration

Edit only `js/config/runtime-config.js`:

```js
globalThis.WEBDROP_RUNTIME_CONFIG = Object.freeze({
  productionSignaling: true,
  realProximityCeremony: true,
  realTransfer: true,
  qrPairing: true,
  signalingUrl: "wss://signal.example.com/ws",
  turnConfigUrl: "https://signal.example.com/api/ice-servers"
});
```

The runtime enforces flag dependencies:

- A blank or invalid `signalingUrl` disables production signaling.
- Real proximity, real transfer, and QR pairing remain effectively disabled unless production signaling is enabled with a valid URL, even if their raw values in `runtime-config.js` are set to `true`.
- TURN credentials are requested only from the server endpoint. The long-lived Cloudflare token never belongs in frontend files.
- The TURN endpoint requires the ephemeral access token returned by the accepted WebSocket session and supports CORS only for configured frontend origins.
- Production server startup rejects an empty or wildcard `ALLOWED_ORIGINS`, disabled TURN authentication, missing TURN credentials when fallback is forbidden, and an enabled metrics endpoint with a placeholder token.
- iPhone-to-iPhone pairing uses a one-time server-issued QR token. Camera access is requested only after the user taps the scanner action; non-iPhone and unsupported browsers continue through sound + motion verification.

## Proximity ceremony

When enabled, a peer swipe triggers permission calls while the user gesture is still active. Both paired browsers then:

1. Request microphone and motion permission.
2. Reset prior motion evidence and begin device-motion capture.
3. Join a peerless proximity session using a one-time client nonce.
4. Receive the same future ceremony timestamp plus an anonymous acoustic slot and signature.
5. Emit the assigned signature in its slot and listen for every other anonymous signature.
   The assigned bands stay between 20.05 and 21.2 kHz; contexts that cannot
   preserve that inaudible band must fail closed and offer QR.
6. Capture actual bump and tilt evidence during the shared ceremony window.
7. Stop motion and analyzer capture while keeping the granted microphone stream warm for retry.
8. Send normalized telemetry, nonce, own signature, strongest heard signature, and timing to the server.
9. Reveal peer identity only after reciprocal signatures, bump timing, and score are verified.

With `ENABLE_PROXIMITY_ANALYSIS=true`, the server blocks RTC signaling, chat, path metrics, and transfer metadata until both peers receive a `verified` proximity decision. File bytes never pass through WebSocket.

## Real-device validation

Use two physical HTTPS-capable devices. Test:

- iOS Safari microphone and `DeviceMotionEvent.requestPermission()` from the swipe gesture.
- Android Chrome microphone and device-motion capture.
- Quiet room, ordinary room, and noisy room chirp correlation.
- Direct Wi-Fi, mobile network, strict network, and TURN relay paths.
- Successful bump and tilt, denied permissions, and QR fallback behavior.
- Small files, multiple files, files larger than memory fallback, cancellation, retry, and receiver storage exhaustion.

Real-device acoustic thresholds and timing may require tuning after measurements. If false-positive or false-negative behavior appears on physical devices, disable enforcement, keep QR available, and re-enable only after telemetry proves the adjusted threshold.

## Verified on June 19, 2026

- Pre-patch production Vercel served app version `1.0.50`; this changeset advances the app/cache key to `1.0.55` for deployment verification.
- Japan East `/readyz` reported production healthy with `proximityAnalysisEnabled:true`.
- Azure `signaling-hub.js` matched the local source hash.
- Public WSS assigned unique anonymous acoustic signatures for four clients and matched only reciprocal pairs.
- Public WSS rejected high-score telemetry when ultrasound was present but bump and tilt evidence were missing.
- `npm run verify:full` passed.
- `npm run test:e2e` passed with 52 passing tests and 44 expected project skips.
- WebKit iPhone E2E covered one-gesture motion/microphone permission, QR camera permission from Scan, nonblank Canvas2D Siri wave, edge-to-edge Dynamic Island geometry, and received-file new-tab behavior.

## Launch blockers

- Keep the validated long-term Cloudflare token only in `/etc/webdrop/signaling.env` on the VM.
- Complete physical two-device over-air calibration before treating proximity enforcement as fully production-proven.
- Signaling load tests should start below 10,000 clients and ramp while watching nginx, Node, file descriptors, memory, CPU, and network throughput.
- Do not horizontally scale the signaling service until presence/session state is moved to shared storage such as Redis or traffic is routed sticky by session.

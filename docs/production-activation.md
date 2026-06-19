# Production Activation Guide

WebDrop's production signaling and real transfer paths are enabled in the current static app configuration. Proximity ceremony and QR pairing remain disabled, so the default app does not request microphone, motion, or camera permission. Local QA can still select the mock adapter explicitly with `?runtime=mock`.

## Activation order

Use this order whenever the live endpoint or feature flags are changed.

1. Deploy or update `azure cloud server/` on the Azure VM.
2. Configure DNS, nginx, Certbot, systemd, firewall rules, exact allowed origins, protected metrics token, and rotated valid Cloudflare TURN Server credentials.
3. Verify `https://<signal-domain>/healthz`, `https://<signal-domain>/readyz`, `wss://<signal-domain>/ws`, and `https://<signal-domain>/api/ice-servers`.
4. Keep `ENABLE_PROXIMITY_ANALYSIS=false` for the first signaling-only smoke test.
5. Verify the frontend URLs in `js/config/runtime-config.js`.
6. Keep production signaling and real transfer enabled only while the endpoint health checks pass; enable the real proximity ceremony afterward.
7. Enable `ENABLE_PROXIMITY_ANALYSIS=true` only after two-device telemetry is visible and calibrated.

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
3. Send `proximity:ready` to the signaling server.
4. Receive the same future `proximity:start` timestamp.
5. Exchange chirps in opposite time slots and measure real Web Audio correlation.
   The shipped signature stays between 20.2 and 21.2 kHz; contexts that cannot
   preserve that inaudible band must fail closed and offer QR.
6. Capture actual bump and tilt evidence during the shared ceremony window.
7. Stop motion capture and microphone tracks.
8. Send normalized telemetry to the server.

With `ENABLE_PROXIMITY_ANALYSIS=true`, the server blocks RTC signaling, chat, path metrics, and transfer metadata until both peers receive a `verified` proximity decision. File bytes never pass through WebSocket.

## Real-device validation

Use two physical HTTPS-capable devices. Test:

- iOS Safari microphone and `DeviceMotionEvent.requestPermission()` from the swipe gesture.
- Android Chrome microphone and device-motion capture.
- Quiet room, ordinary room, and noisy room chirp correlation.
- Direct Wi-Fi, mobile network, strict network, and TURN relay paths.
- Successful bump and tilt, denied permissions, and QR fallback behavior.
- Small files, multiple files, files larger than memory fallback, cancellation, retry, and receiver storage exhaustion.

Real-device acoustic thresholds and timing may require tuning after measurements. Keep production enforcement disabled until false-positive and false-negative behavior is understood.

## Verified locally on June 18, 2026

- Production-mode server startup and `/readyz`.
- Exact Vercel-origin CORS and WebSocket admission.
- Authenticated Cloudflare TURN credential issuance with STUN fallback disabled.
- Two-page invite/accept, simultaneous bidirectional file transfer, and disconnect.
- Forced TURN relay carrying bidirectional DataChannel bytes in Chromium.

## Launch blockers

- Restore the currently unreachable Japan East Azure VM and repeat the local proofs through the public TLS endpoint.
- Keep the validated long-term Cloudflare token only in `/etc/webdrop/signaling.env` on the VM.
- Signaling load tests should start below 10,000 clients and ramp while watching nginx, Node, file descriptors, memory, CPU, and network throughput.
- Do not horizontally scale the signaling service until presence/session state is moved to shared storage such as Redis or traffic is routed sticky by session.

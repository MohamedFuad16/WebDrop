# Production Activation Guide

WebDrop's production networking, proximity ceremony, QR pairing, and real transfer paths are implemented but intentionally disabled in the default static app. The default app continues to use mock signaling and does not request microphone, motion, or camera permission.

## Activation order

Do not enable the frontend flags until the AWS signaling server is deployed and tested.

1. Deploy `aws cloud server/` to EC2.
2. Configure DNS, nginx, Certbot, systemd, firewall rules, exact allowed origins, protected metrics token, and rotated valid Cloudflare TURN Server credentials.
3. Verify `https://<signal-domain>/healthz`, `wss://<signal-domain>/ws`, and `https://<signal-domain>/api/ice-servers`.
4. Keep `ENABLE_PROXIMITY_ANALYSIS=false` for the first signaling-only smoke test.
5. Configure the frontend URLs in `js/config/runtime-config.js`.
6. Enable production signaling, then real transfer, then the real proximity ceremony.
7. Enable `ENABLE_PROXIMITY_ANALYSIS=true` only after two-device telemetry is visible and calibrated.

Use [deployment-sizing.md](deployment-sizing.md) before selecting an EC2 size. `t3.micro` is suitable for smoke testing, not the documented 10,000-client goal. Start serious single-node load testing at `t3.large` or an equivalent 2-vCPU/8-GiB instance, and treat the final size as a measured result.

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
- Production server startup rejects an empty `ALLOWED_ORIGINS`; configure the exact HTTPS frontend origins before starting the service.
- iPhone-to-iPhone pairing uses a one-time server-issued QR token. Camera access is requested only after the user taps the scanner action; non-iPhone and unsupported browsers continue through sound + motion verification.

## Proximity ceremony

When enabled, a peer swipe triggers permission calls while the user gesture is still active. Both paired browsers then:

1. Request microphone and motion permission.
2. Reset prior motion evidence and begin device-motion capture.
3. Send `proximity:ready` to the signaling server.
4. Receive the same future `proximity:start` timestamp.
5. Exchange chirps in opposite time slots and measure real Web Audio correlation.
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

## Launch blockers

- Validate the configured Cloudflare TURN key from the deployed server before relay testing. Keep the long-term token only in the EC2 environment file.
- Direct and relay transfer have code-level coverage but still need a deployed WSS/TURN endpoint and two-browser proof.
- Signaling load tests should start below 10,000 clients and ramp while watching nginx, Node, file descriptors, memory, CPU, and network throughput.
- Do not horizontally scale the signaling service until presence/session state is moved to shared storage such as Redis or traffic is routed sticky by session.

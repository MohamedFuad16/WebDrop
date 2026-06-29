# Known Issues, Edge Cases & Gotchas

Observed in the real code. "Resolution" = how the code already handles it or what to do.

## Build/tooling
- **`?v=1.0.90` import query strings break static analyzers.** `madge`/`dependency-cruiser` resolve `./foo.js?v=…` to a non-existent path and report **empty** dependencies. *Resolution:* the graph in `agent/graph/` was built by reading imports directly; regenerate the same way. When bumping the version, change it in `package.json`, `service-worker.js` (`APP_VERSION`), `runtime-config.js`/`readiness.js`, **and** every `?v=` import suffix together.
- **`js/ui/siri-wave.js` is effectively orphaned.** No runtime module statically imports it; it's only dynamically imported by `tests/e2e/app-ui.spec.mjs` and precached in `service-worker.js`. Don't assume it's dead — but also don't expect it on the main import graph.

## Signaling fallbacks & failure modes
- **Mock vs production selection.** Runtime flags only activate when `productionSignaling===true` **and** a valid `signalingUrl` exists (`runtime-flags.js`). Otherwise the app silently uses `MockSignalingAdapter` with fake peers — easy to mistake for "it's connected to prod." Force mock on localhost with `?runtime=mock`.
- **`connection-failed` only toasts in production.** In mock mode failures are swallowed by design. WebSocket reconnects with exponential backoff (cap 15 s); a `connected` server message restarts the heartbeat.
- **`protocol:error` code `client_id_in_use`** is surfaced as "signaling lost" — usually two tabs sharing a `sessionStorage` client id is avoided because the id is per-tab, but cloned tabs can collide.

## WebRTC
- **ICE candidates can arrive before the remote description.** `webrtc-transport.js` buffers them in `pendingCandidates` and flushes after `setRemoteDescription`. Don't reorder this.
- **Connection-wait timeouts.** `waitForTransportConnection` (controller, 30 s) rejects on `failed`/`closed` or timeout; the controller then `resetFailedVerification`. `preflight()` does a 450 ms probe to classify direct/relay.
- **No TURN ⇒ relay can fail behind symmetric NAT.** `TurnConfigProvider.getRemoteConfig()` throws if there's no authenticated token and falls back to **STUN only** (Cloudflare). Direct works; relay-needing networks won't. Ensure the server's TURN broker is configured for production.
- **SDP CRLF normalization** (`normalizeSdp`) is required for cross-browser interop; both client and server normalize. Don't strip it.

## Transfer protocol
- **Chunk header/payload ordering is strict.** A JSON `file:chunk` header must be immediately followed by its binary payload. If a new header arrives first, the receiver requests a retry and emits `protocol-error`. Receiver also enforces in-order offsets (gap ⇒ `transfer:retry`).
- **Caps.** 500 MB per session (sender and receiver both reject oversize manifests); chunk 256 KB; receiver-ready timeout 45 s; completion timeout 30 min. Completion only fires once `receivedBytes >= totalBytes` (a late `transfer:complete` is held in `completionPending`).
- **Backpressure.** Sender awaits `bufferedamountlow` when `bufferedAmount` exceeds 8 MB; dropping this risks unbounded memory growth.

## Proximity ceremony
- **Local pass requires ultrasound + bump + tilt (not score alone).** `hasRequiredPhysicalEvidence` mirrors the server gate so the client doesn't claim "passed" on evidence the server will reject. Changing the score weights without this gate causes false positives.
- **Non-reciprocal acoustic match** (`ambiguous_or_nonreciprocal_match`): one phone heard the chirp, the other didn't. The UI says "realign," not "bump harder" (`proximityServerReasonKey`). Preserve that distinction.
- **Ultrasound needs real hardware + secure context.** ~18.6–19.4 kHz emit/detect requires mic + speaker permission and a high-enough sample rate; some devices/laptops can't reproduce or hear it. The server can fail with `acoustic_not_detected` even when one side worked.
- **iOS permission gotcha.** DeviceMotion/mic prompts must run inside a user gesture. `ensureProximityPermissions()` starts all native prompts **before** awaiting so user activation isn't lost on iPhone Safari. Don't `await` between the gesture and the permission calls.

## Storage (iOS especially)
- **iOS Safari uses the in-memory Blob backend, capped at 128 MB.** `selectBackend` throws `StorageClientError("BLOB_FALLBACK_CAP_EXCEEDED")` past that; non-iOS without streaming throws `STREAM_UNAVAILABLE`. Large transfers to iPhone will fail by design.
- **StreamSaver** download needs its service worker (`vendor/streamsaver/`) and is disabled on iOS.

## PWA / caching
- **Service worker only registers off-localhost.** Local dev never gets SW caching (intentional). A `controllerchange` reload guard prevents infinite reloads on update.
- **`runtime-config.js` is always fetched network-only** (`no-store`) so production toggles/URLs update without a cache bust.

## UI / rendering
- **Personalized QR depends on ECC level H.** `DynamicIsland.drawQr` overlays an avatar badge on the *display* QR, which only stays scannable because the code is rendered at level **H**. If you drop it back to "M"/"Q" or enlarge the badge/knockout, re-check `tests/qr-personalized.test.mjs` (it asserts `jsQR` still decodes the badged code). Badge ≈ 24% of the code; knockout = badge + ~1.4 modules.
- **QR avatar images are cached in `qrLogoCache` (module-level `Map`).** A warm badge paints synchronously; a cold one paints on image `load`, guarded by `state === "qr-display"` + matching `currentQrToken` so a stale async load can't draw over a newer code.
- **No white "halo" behind the island tile-wave.** The blurred radial glow (`.webdrop-island__flow::before`) and the wave `drop-shadow` were removed on purpose — the canvas already supplies per-tile bloom via `shadowBlur`. Don't reintroduce a blurred backdrop; it reads as a dirty halo on the near-black panel.
- **Avatar-carousel icons have no frame disc.** `.avatar-carousel button` is intentionally `background: transparent; box-shadow: none` so the pastel avatar art sits clean on the (dark) settings sheet. The blue selection ring is the separate `::after`.

## Security/secrets gotcha
- **`js/config/local-admin-token.js` currently holds a real metrics bearer token on this machine.** It is gitignored and must never be committed. See `secrets.md`. If it leaks, rotate `METRICS_API_TOKEN` on the server.

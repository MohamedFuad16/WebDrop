# Known Issues, Edge Cases & Gotchas

Trimmed on 2026-10-14. Each gotcha below is shortened; the full text and the incident narratives are in `agent/archive/errors-full.md` (moved verbatim).

## Build/tooling
- **`?v=1.0.93` import query strings break static analyzers.** `madge`/`dependency-cruiser` resolve `./foo.js?v=…` to a non-existent path and report **empty** dependencies.
- **`js/ui/siri-wave.js` is effectively orphaned.** No runtime module statically imports it; it's only dynamically imported by `tests/e2e/app-ui.spec.mjs` and precached in `service-worker.js`.

## Signaling fallbacks & failure modes
- **Mock vs production selection.** Runtime flags only activate when `productionSignaling===true` **and** a valid `signalingUrl` exists (`runtime-flags.js`).
- **`connection-failed` only toasts in production.** In mock mode failures are swallowed by design.
- **`protocol:error` code `client_id_in_use`** is surfaced as "signaling lost" — usually two tabs sharing a `sessionStorage` client id is avoided because the id is per-tab, but cloned tabs can collide.

## WebRTC
- **ICE candidates can arrive before the remote description.** `webrtc-transport.js` buffers them in `pendingCandidates` and flushes after `setRemoteDescription`.
- **Connection-wait timeouts.** `waitForTransportConnection` (controller, 30 s) rejects on `failed`/`closed` or timeout; the controller then `resetFailedVerification`.
- **No TURN ⇒ relay can fail behind symmetric NAT.** `TurnConfigProvider.getRemoteConfig()` throws if there's no authenticated token and falls back to **STUN only** (Cloudflare).
- **SDP CRLF normalization** (`normalizeSdp`) is required for cross-browser interop; both client and server normalize.

## Transfer protocol
- **Chunk header/payload ordering is strict.** A JSON `file:chunk` header must be immediately followed by its binary payload.
- **Caps.** 500 MB per session (sender and receiver both reject oversize manifests); chunk 256 KB; receiver-ready timeout 45 s; completion timeout 30 min.
- **A duplicate `transfer:manifest` must be idempotent.**
- **Peer-controlled filenames are sanitized at storage intake.**
- **Backpressure.** Sender awaits `bufferedamountlow` when `bufferedAmount` exceeds 8 MB; dropping this risks unbounded memory growth.
- **App control messages need a `type` and must be forwarded.** `handleControlMessage` drops any message without `.type`, and unknown types fall through to a `control` event.

## Proximity ceremony
- **Policy updates are revisioned and affect new sessions only.** `RuntimeProximityPolicy` snapshots score/timing onto each session; changing Settings while devices are already running intentionally does not alter them.
- **Late-tap grace is not the same as acoustic airtime.** `lateTapGraceMs` controls how long a lone first tap may wait to admit a partner.
- **A high local score can still fail if final telemetry is one-sided.**
- **Safari mic prompts can be hidden by stale app-local permission cache.** Do not reintroduce a controller shortcut that skips `getUserMedia()` when `webdrop.proximityPermissions.microphone` is `"denied"`.
- **Local pass requires ultrasound + bump + tilt (not score alone).** `hasRequiredPhysicalEvidence` mirrors the server gate so the client doesn't claim "passed" on evidence the server will reject.
- **Non-reciprocal acoustic match** (`ambiguous_or_nonreciprocal_match`): one phone heard the chirp, the other didn't.
- **Ultrasound needs real hardware + secure context.** ~17.8–19.8 kHz emit/detect requires mic + speaker permission and a high-enough sample rate; some devices/laptops can't reproduce or hear it.
- **Acoustic lanes must stay under the 44.1kHz Nyquist emit cap (the lane-3 silence gotcha).**
- **Capture starts before `startAt`; the decoder must be told the lead.** `exchangeCapturedSignatureChirps` (`proximity-engine.js`) starts `startCeremonyCapture` immediately, then waits until `startAt` to emit, so the recording's t=0 precedes the slot grid by `leadMs`.
- **iOS permission gotcha.** DeviceMotion/mic prompts must run inside a user gesture.
- **The client acoustic-plan filter must track the server band floor (the dead-lane fossil).** `normalizeAcousticPlan` (`proximity-engine.js`) drops any signature whose `startFrequencyHz` is below a threshold.
- **`session.expiresAt` must cover the failTimer linger, not just the join TTL (the telemetry expiry race).**
- **Reconcile the AudioContext to the mic track rate AFTER permissions settle, never inside `requestMicrophonePermission`.**
- **The acoustic early-exit must wait for the bump.**
- **Warm up acoustics at the Connect tap (preflight), not only in the sync headroom.**
- **The motion snapshot latches bump/tilt from capture start, not from `startAt` — the engine must reset at the window open.**
- **The acoustic winner-margin gate is 2-device-only — never reintroduce it for cohorts.**
- **Cross-cohort wrong-pair matches: the veto must see OTHER sessions' bumps, and matching must wait for them.**
- **Never feed the island motion polls before `startAt`, and never let a stale ceremony stop the sensors.**
- **Server teardown must tombstone bumps before destroying telemetry.**
- **A denied motion/mic permission must abort the ceremony BEFORE joining the cohort.**

## Storage (iOS especially)
- **iOS Safari uses the in-memory Blob backend, capped at 128 MB.** `selectBackend` throws `StorageClientError("BLOB_FALLBACK_CAP_EXCEEDED")` past that; non-iOS without streaming throws `STREAM_UNAVAILABLE`.
- **StreamSaver** download needs its service worker (`vendor/streamsaver/`) and is disabled on iOS.
- **StreamSaver must register its OWN service worker even when the app's root SW exists.**

## PWA / caching
- **Service worker only registers off-localhost.** Local dev never gets SW caching (intentional).
- **`runtime-config.js` is always fetched network-only** (`no-store`) so production toggles/URLs update without a cache bust.
- **Activate precache is tolerant, not all-or-nothing.** `activate` deletes *every* cache then rebuilds the current precache with a per-asset `fetch → if ok cache.put` loop.

## Admin test recordings
- **Run history is local to one admin browser.** `webdrop.adminTestRuns.v1` lives in `localStorage`; it is not synchronized to the signaling server.
- **Admin auth must never depend on `prompt()`.** Embedded browsers can disable modal prompts.

## UI / rendering
- **Personalized QR depends on ECC level H.** `DynamicIsland.drawQr` overlays an avatar badge on the *display* QR, which only stays scannable because the code is rendered at level **H**.
- **QR avatar images are cached in `qrLogoCache` (module-level `Map`).**
- **The island wave canvas must stay `position:absolute` in `.webdrop-island__flow`.**
- **The transfer HUD has no progress bar — the tiles are the bar.** `TileWave.setTransferMode(true)` + `setProgress(ratio)` make tiles past the progress front render dim/desaturated while filled tiles keep the sweep (ADR-0007).
- **No white "halo" behind the island tile-wave.** The blurred radial glow (`.webdrop-island__flow::before`) and the wave `drop-shadow` were removed on purpose — the canvas already supplies per-tile bloom via `shadowBlur`.
- **Avatar-carousel icons have no frame disc.** `.avatar-carousel button` is intentionally `background: transparent; box-shadow: none` so the pastel avatar art sits clean on the (dark) settings sheet.
- **Dark-theme white-halo trap: never use `var(--ink)` in an avatar `box-shadow`.** In dark theme `--ink` is near-white (`#f4f4f2`), so `color-mix(in srgb, var(--ink) X%, transparent)` shadows glow white.
- **Scan frame must not show a stale QR.** `showQrScanner` clears `[data-island-qr-canvas]` on entry; otherwise a QR drawn during a prior `qr-display` lingers behind the viewfinder.

## Security/secrets gotcha
- **`js/config/local-admin-token.js` currently holds a real metrics bearer token on this machine.** It is gitignored and must never be committed.

## Hosting on Monaca (gotchas)
- **A WebSocket upgrade refused on origin leaves NO server log.** `signaling-hub.js` answers a disallowed `Origin` with a raw `403` then `socket.destroy()` — no log line, nothing in `journalctl`, nothing in `/api/diagnostics-public`. Client-side it is only a bare close **code 1006** and `signalingStatus: "offline"` → the UI reads **"Nearby service unavailable"**. If a client "can't connect" and the server looks idle, suspect the origin allowlist FIRST. Probe it directly: `curl -H "Origin: <origin>" https://<host>/api/ice-servers` → `403 origin_not_allowed` (bad) vs `401 unauthorized` (origin fine, just needs the bearer).
- **Every new frontend domain needs its own `ALLOWED_ORIGINS` entry on the live server (2026-10-14 outage).** Moving the site to `webdrop.mohamedfuad.com` without adding it to `/etc/webdrop/signaling.env` took WebDrop down for that domain while the Vercel URL kept working, so the outage looked partial. Add the origin, restart `webdrop-signaling`, then probe the upgrade: `curl --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: <origin>' https://signal.mohamedfuad.com/ws` must print `101`, not `403`. Keep `azure cloud server/.env.example` in step.
- **Monaca serves `.mjs` as `application/octet-stream`.**
- **Monaca serves the app from two different origins.** `console.monaca.education` is the Cloud IDE preview; the "View on Phone" QR uses `direct-preview-<projectId>.monaca.education`.
- **`/preview-content/...` is session-gated, not public.** Without a Monaca login cookie it returns `200` with a stub body (`postMessage({action:"go-to-login"})`) — standalone that renders a **blank page**.

## Dynamic-island ceremony timing (gotcha)
- **`island.now()` is `performance.now()` (ms since page load), NOT epoch.**
- **Bump DETECTION is independent of the island display.**

## Signaling protocol errors (gotcha)
- **`client:hello` is first-frame only.** Re-sending it on an open socket used to return `protocol:error unsupported_type`.
- **`protocol:error` carries no offending message type.** The controller maps it to a toast by `code` only.

# Components & Modules

Each module's responsibility, key file(s), and dependencies. Most classes extend `Emitter` (`js/utils/emitter.js`) and communicate via events rather than direct calls. See `graph/graph.md` for the full impact graph.

## UI components
| Component | File | Responsibility | Depends on | Used by |
|---|---|---|---|---|
| **AppView** | `js/ui/app-view.js` | Owns all DOM: orbital peer radar, bottom sheets (peer/connection-method/QR/settings/info/send/receive/chat), toasts, avatar picker+cropper, swipe-to-send, i18n render. Emits semantic UI events; exposes imperative methods the controller calls. | `emitter`, `format`, `avatar-options`, `i18n`, `received-files`, `dynamic-island` | `controller` (via `app.js`) |
| **DynamicIsland** | `js/ui/dynamic-island.js` | iPhone-style status pill: ceremony progress, QR display + scanner, transfer HUD, wave animation. Transfer HUD has **no bar** — the tile-wave *is* the progress (`syncWave` toggles transfer mode, `paintTransferProgress` → `wave.setProgress`; ADR-0007). `drawQr(token, avatar)` renders the *display* QR at ECC level **H** with a cached avatar centre badge (ADR-0006). `updatePeerProfile(peer)` refreshes the connected peer's island avatar/name live on a `profile:update` (ADR-0008). | `qrcode-generator`, `emitter`, `format`, `avatar-options`, `tile-wave`, `proximity-engine` (`BUMP_SCORE_POINTS`) | `app-view` |
| **TileWave** | `js/ui/tile-wave.js` | Canvas tile-wave animation in the island. `setDirection(±1)`, `setTransferMode(on)`, `setProgress(ratio)` — in transfer mode tiles past the progress front render as a dim "remaining track" so the lit region fills with progress (honored in `#draw` + static `#drawStatic`). | — | `dynamic-island` |
| **SiriWaveCore** | `js/ui/siri-wave.js` | Siri-style wave animation. **Not statically imported by runtime modules** — referenced only by e2e tests + SW precache (see `errors.md`). | — | tests / SW |
| HTML/CSS | `index.html`, `admin/*.html`, `css/*.css` | Markup + styling; JS binds via `[data-*]` selectors. | — | — |

## Core
| Module | File | Responsibility | Depends on | Used by |
|---|---|---|---|---|
| **store** | `js/core/state.js` | Observable state container (`getState/setState/patch/update/subscribe`). | — | everything |
| **controller** | `js/core/controller.js` | Orchestrator / state machine: wires signaling+view+transfer events, runs ceremony/QR/pairing/transfer/chat/admin-monitor. No direct DOM. On avatar/ring/name change `broadcastSelfProfile()` (debounced) sends a data-channel `profile:update` + signaling re-announce; an inbound `control` `profile:update` patches the connected peer + island (ADR-0008). | `format`, `received-files`, `proximity-engine` | `app.js` |

## Services
| Module | File | Responsibility | Depends on | Used by |
|---|---|---|---|---|
| **WebSocketSignalingAdapter** | `js/services/websocket-signaling.js` | Production WS signaling: handshake, heartbeat, reconnect, message send + event normalize, TURN token broker. `updateProfile(self)` re-announces `client:hello` (cached capabilities) for best-effort live profile presence (ADR-0008). | `emitter` | `app.js`, `controller`, `transport` |
| **MockSignalingAdapter** | `js/services/mock-signaling.js` | In-memory dev signaling: 15 fake peers, simulated invites/proximity/QR/RTC. | `emitter`, `avatar-options` | `app.js`, `controller` |
| **TurnConfigProvider** | `js/services/turn-config.js` | Fetch + cache ICE/TURN servers (Bearer); STUN fallback. | — | `transport` |
| **ProximityEngine** | `js/services/proximity-engine.js` | Run physical ceremony, compute `proximityScore`, enforce ultrasound+bump+tilt gate; exports `PROXIMITY_SCORE_MINIMUM`, `BUMP_SCORE_POINTS`, `proximityScore`. | `acoustic-proximity`, `motion-proximity`, `proximity-token` | `app.js`, `controller`, `dynamic-island` |
| **AcousticProximitySensor** | `js/services/acoustic-proximity.js` | Web Audio ultrasonic chirp emit/detect + signature decode. | — | `proximity-engine` |
| **MotionProximitySensor** | `js/services/motion-proximity.js` | DeviceMotion bump/tilt capture + permission. | — | `proximity-engine` |
| **proximity-token** | `js/services/proximity-token.js` | `createQrToken`/`decodeQrToken`/`validateQrToken` (`wdp1.<base64url>`, TTL). | — | `proximity-engine` |
| **WebRtcTransport** | `js/services/webrtc-transport.js` | `RTCPeerConnection` lifecycle, SDP/ICE over signaling, two data channels, path stats. `sendControlMessage(msg)` + forwarded `control` event carry app control JSON (e.g. `profile:update`) over the control channel (ADR-0008). | `emitter`, `data-channel-transfer-protocol` | `app.js`, `controller`, `transfer-engine` |
| **DataChannelTransferProtocol** | `js/services/data-channel-transfer-protocol.js` | Manifest + chunk + ack/retry/cancel/complete protocol; backpressure; 500 MB cap. Unknown control `type`s fall through to a `control` event (used for `profile:update`). | `emitter`, `workers/incremental-sha256` | `webrtc-transport` |
| **TransferEngine** | `js/services/transfer-engine.js` | Send/receive orchestration bridging transport ↔ storage; mock progress when disabled. | `emitter` | `app.js`, `controller` |
| **capabilities** | `js/services/capabilities.js` | Feature detection (mic, motion, WebRTC, OPFS, camera, platform). | — | `app.js` |

## Storage
| Module | File | Responsibility |
|---|---|---|
| **StorageClient** | `js/storage/storage-client.js` | Façade selecting a backend per session: `DeferredIndexedDbStorageClient`, `DownloadStreamStorageClient`, `BlobStorageClient` (iOS). Quota, session/file lifecycle, export, cleanup. Depends on `vendor/streamsaver-adapter`. |
| **IncrementalSha256** | `workers/incremental-sha256.js` | Streaming SHA-256 for manifest hashing. |

## Config / utils
- `js/config/runtime-flags.js` — effective feature flags. `runtime-config.js` — injects prod URLs/toggles. `i18n.js` — en/ja. `avatar-options.js` — avatar list + helpers. `local-admin-token.js` — gitignored admin token.
- `js/utils/emitter.js` — `Emitter` base (on/emit). `format.js` — `formatBytes`. `received-files.js` — preview-safety check.

## Admin (separate entry: `admin/index.html`)
- `js/admin/readiness.js` — dashboard controller: polls diagnostics, renders readiness/live testing, runs ultrasonic monitor. Depends on `operations-i18n.js`, `diagnostics-api.js`, `shared.js`.
- `js/admin/diagnostics-api.js` — `DiagnosticsApi` (`/readyz`, `/api/diagnostics-public`). `operations-i18n.js` — admin strings. `shared.js` — formatting helpers.

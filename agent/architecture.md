# Architecture

WebDrop v2 is a **static, no-build single-page PWA** served from the repo root (`index.html` + `js/` ES modules + `css/`). All application logic runs in the browser. The only backend is a separate Node WebSocket signaling + TURN-credential server in `azure cloud server/` (documented in `api.md`). Diagram: [`graph/architecture.svg`](graph/architecture.svg) (source [`graph/architecture.d2`](graph/architecture.d2)).

## Layers and major modules

### Bootstrap — `js/app.js`
The entry module (loaded via `<script type="module">`). It builds the singleton object graph and wires it together:
- Creates the observable `store` (`core/state.js`) with the initial UI state (self identity, peers, mode, theme, locale, …).
- Instantiates both signaling adapters (`MockSignalingAdapter`, `WebSocketSignalingAdapter`) and picks one based on runtime flags.
- Instantiates `TurnConfigProvider`, `ProximityEngine`, `WebRtcTransport`, `TransferEngine`, `StorageClient`, and `AppView`.
- Calls `createController(...)` to connect everything, then detects capabilities and connects signaling.
- Registers the service worker (non-localhost only), persists identity in `localStorage`/`sessionStorage`.

### Core — `js/core/`
- **`state.js`** — `createStore()`: a tiny observable store with `getState/setState/patch/update/subscribe`. The single source of UI truth.
- **`controller.js`** — the orchestrator and de-facto state machine (largest core file). It subscribes to signaling events, view (UI) events, and transfer events, and drives the connection lifecycle: lobby → verifying → connected → disconnecting. It owns the **proximity ceremony**, **QR pairing**, **invite/pairing** flows, transfer start, chat, and the admin acoustic monitor. It never touches the DOM directly — it mutates the store and calls `view.*` methods.

### Signaling — `js/services/` (pluggable, same event interface)
- **`websocket-signaling.js`** (`WebSocketSignalingAdapter`) — production transport. Opens a `wss://` socket, sends `client:hello`, heartbeats, auto-reconnects with backoff, and emits normalized events (`peers`, `invite`, `rtcSignal`, `proximity:*`, etc.). Brokers a TURN access token.
- **`mock-signaling.js`** (`MockSignalingAdapter`) — in-memory dev/demo adapter with 15 fake peers. Simulates invites, proximity sessions, QR issue/verify, and RTC echo so the whole UI works offline with no server.
- **`turn-config.js`** (`TurnConfigProvider`) — fetches ICE/TURN servers from the server (Bearer-authed) and caches them; falls back to public Cloudflare STUN.

### Proximity — `js/services/`
- **`proximity-engine.js`** (`ProximityEngine`) — coordinates the physical-proximity "ceremony" and computes a `proximityScore`. Delegates to acoustic + motion sensors and the QR token helper. `hasRequiredPhysicalEvidence` requires ultrasound **and** bump **and** tilt to pass (mirrors the server gate).
- **`acoustic-proximity.js`** (`AcousticProximitySensor`) — Web Audio ultrasonic chirp emit/detect (~18.6–19.4 kHz), slot-scheduled signature exchange.
- **`motion-proximity.js`** (`MotionProximitySensor`) — DeviceMotion bump/tilt detection.
- **`proximity-token.js`** — encode/validate short-lived QR pairing tokens (`wdp1.<base64url>`).

### Transport + Transfer — `js/services/`
- **`webrtc-transport.js`** (`WebRtcTransport`) — wraps `RTCPeerConnection`. Performs SDP offer/answer + ICE exchange **through the signaling adapter**, opens two ordered data channels (`webdrop-control-v1`, `webdrop-file-v1`), classifies the path (direct vs relay) from `getStats()`, and owns a `DataChannelTransferProtocol` instance.
- **`data-channel-transfer-protocol.js`** (`DataChannelTransferProtocol`) — the application-level transfer protocol over the data channels: builds a SHA-256 manifest, streams 256 KB chunks (header-then-binary), backpressure via `bufferedAmount`, acks, retries, cancel, and completion verification. 500 MB session cap.
- **`transfer-engine.js`** (`TransferEngine`) — send/receive orchestration that bridges the transport protocol to storage. On receive it prepares storage, writes chunks in order, finalizes, and emits `receive-ready/receive-progress/received`. When disabled (mock mode) it simulates progress.

### Storage — `js/storage/storage-client.js`
`StorageClient` is a façade that selects one of three backends per session by capability/size:
- **`DeferredIndexedDbStorageClient`** — chunks to IndexedDB, export via Blob or StreamSaver.
- **`DownloadStreamStorageClient`** — StreamSaver streaming download (non-iOS).
- **`BlobStorageClient`** — in-memory Blob fallback (used on iOS Safari; 128 MB cap).
Handles quota estimation, session/file lifecycle, export, and cleanup.

### UI — `js/ui/`
- **`app-view.js`** (`AppView`) — owns the entire DOM: the orbital peer radar, bottom sheets (peer/send/receive/chat/settings/QR), toasts, avatar cropper, swipe-to-send, i18n rendering. Emits semantic events (`connect-peer`, `send`, `files-selected`, `disconnect`, …) consumed by the controller, and exposes imperative methods the controller calls. Subscribes to the store and re-renders.
- **`dynamic-island.js`** (`DynamicIsland`) — the iPhone-style status pill: connection-ceremony progress, QR display/scanner (uses `jsQR`/`BarcodeDetector` + `qrcode-generator`), and the live transfer HUD.
- **`tile-wave.js`, `siri-wave.js`** — canvas wave animations (siri-wave is referenced by tests/SW only; see `errors.md`).

### Config, utils, admin
- **`config/`** — `runtime-flags.js` (derives feature flags), `runtime-config.js` (injects production URLs into `globalThis.WEBDROP_RUNTIME_CONFIG`), `i18n.js` (en/ja strings), `avatar-options.js`, `local-admin-token.js` (gitignored).
- **`utils/`** — `emitter.js` (the `Emitter` base class everything extends), `format.js`, `received-files.js`.
- **`admin/`** + `admin/index.html`, `admin/diagnostics.html` — the operations dashboard (`readiness.js`) polling the server diagnostics endpoint and running the ultrasonic monitor.
- **`workers/incremental-sha256.js`** — streaming SHA-256 used by the transfer protocol manifest.

## How signaling → WebRTC → transfer connect

1. **Discovery:** signaling emits `peers`; `AppView` renders the orbit.
2. **Intent:** user taps a peer (or "connect nearby"); controller sends `invite` / joins a proximity session.
3. **Verification:** controller runs the proximity ceremony (acoustic + motion) or QR pairing; sends telemetry; the server (or mock) returns a verified `pairingId` + match.
4. **Connect:** controller calls `transport.connect(peerId,{initiator})`. `WebRtcTransport` exchanges SDP/ICE **over the signaling channel** and opens the two data channels.
5. **Transfer:** user picks files; `TransferEngine.send()` → `DataChannelTransferProtocol.sendFiles()` streams manifest + chunks **directly peer-to-peer** (signaling is no longer in the data path). Receiver writes chunks to `StorageClient` and finalizes.

## Data vs control flow
- **Control plane** (WebSocket JSON, small): presence, invites, pairing, proximity telemetry, SDP/ICE relay, chat, path metrics, admin monitor.
- **Data plane** (WebRTC data channel, large/binary): file manifest + chunks + acks. Never traverses the WebSocket (the server rejects binary frames).
- **Runtime flags** gate whether production signaling, real proximity, real transfer, and QR pairing are active; mock paths keep the UI fully functional offline.

See `components.md` for per-module responsibilities/dependencies, `data.md` for exact message/packet shapes, and `graph/graph.md` for impact analysis.

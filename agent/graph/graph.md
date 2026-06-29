# Dependency & Impact Graph

Human-readable companion to [`dependencies.dot`](dependencies.dot) / [`dependencies.json`](dependencies.json) and the architecture diagram [`architecture.svg`](architecture.svg) (source [`architecture.d2`](architecture.d2)).

> **Note on generation:** `madge` and `dependency-cruiser` return **empty** edges for this repo because imports carry `?v=1.0.89` cache-busting query strings (e.g. `import {X} from "./foo.js?v=1.0.89"`) that defeat path resolution. The graph below was therefore built **deterministically by reading the real `import … from` statements** across `js/` + `workers/`. Regenerate the same way (or strip `?v=` before running a tool). `architecture.svg` was rendered with `d2 0.7.1`.

## Entry points
- `js/app.js` — main app (loaded by `index.html` as a module).
- `js/admin/readiness.js` — operations dashboard (loaded by `admin/index.html`).
- `js/config/runtime-config.js` — classic script that sets global config (no imports).

## Who imports whom (forward dependencies)
```
app.js
 ├─ core/state.js                         (leaf)
 ├─ core/controller.js ── utils/format, utils/received-files, services/proximity-engine
 ├─ services/capabilities.js              (leaf)
 ├─ services/mock-signaling.js ── utils/emitter, config/avatar-options
 ├─ services/websocket-signaling.js ── utils/emitter
 ├─ services/turn-config.js               (leaf)
 ├─ services/proximity-engine.js ── services/acoustic-proximity, motion-proximity, proximity-token
 ├─ services/webrtc-transport.js ── utils/emitter, services/data-channel-transfer-protocol
 ├─ services/transfer-engine.js ── utils/emitter
 ├─ storage/storage-client.js ── vendor/streamsaver-adapter
 ├─ ui/app-view.js ── utils/emitter, utils/format, config/avatar-options, config/i18n,
 │                    utils/received-files, ui/dynamic-island
 ├─ config/avatar-options.js              (leaf)
 └─ config/runtime-flags.js               (leaf)

ui/dynamic-island.js ── vendor/qrcode-generator, utils/emitter, utils/format,
                        config/avatar-options, ui/tile-wave, services/proximity-engine
services/data-channel-transfer-protocol.js ── utils/emitter, workers/incremental-sha256

admin/readiness.js ── admin/operations-i18n, admin/diagnostics-api, admin/shared
```

## Most-depended-upon modules (change with extreme care)
- **`utils/emitter.js`** — base class for `app-view`, `dynamic-island`, `mock-signaling`, `websocket-signaling`, `transfer-engine`, `webrtc-transport`, `data-channel-transfer-protocol`. Changing its `on/emit` contract touches almost everything.
- **`services/proximity-engine.js`** — imported by `app.js`, `core/controller.js`, and `ui/dynamic-island.js` (for `BUMP_SCORE_POINTS`/scoring). Its score weights + pass gate are mirrored on the server.
- **`config/avatar-options.js`** — used by `app.js`, `mock-signaling`, `app-view`, `dynamic-island`.
- **`utils/format.js`**, **`utils/received-files.js`** — used by controller + UI.

## Impact map — "if you change X, also check Y/Z"
- **`core/state.js` (store shape):** every store consumer — primarily `ui/app-view.js` (`render`) and all of `core/controller.js`. Update `agent/data.md`.
- **`services/data-channel-transfer-protocol.js` (manifest/chunk/control formats):** `services/webrtc-transport.js` (forwards its events) and `services/transfer-engine.js` (consumes manifest/chunk/complete), plus the server's `transfer:manifest` validation in `azure cloud server/src/message-schema.js`. Update `agent/api.md` + `data.md`.
- **`services/webrtc-transport.js` (events/channels):** `transfer-engine.js` and `core/controller.js` (`waitForTransportConnection`, path stats).
- **Signaling event names/shape (`websocket-signaling.js` / `mock-signaling.js`):** `core/controller.js` (the big set of `signaling.on(...)` handlers) and `webrtc-transport.js` (`rtcSignal`). Keep both adapters in sync, and align with the server hub.
- **`services/proximity-engine.js` scoring/gate:** `core/controller.js` (ceremony orchestration, failure messages) and `ui/dynamic-island.js` (metrics display). Mirror changes in the server gate (`hasRequiredPhysicalEvidence`).
- **`storage/storage-client.js` backend API:** `services/transfer-engine.js` (prepare/writeChunk/finalize/export) and `core/controller.js` (`open-received` export). Update `agent/data.md`.
- **`ui/app-view.js` emitted events:** `core/controller.js` `view.on(...)` handlers. Adding a UI action means adding a controller handler.
- **`config/runtime-flags.js` / `runtime-config.js`:** `app.js` wiring + every "real vs mock" branch in `controller.js`. Update `agent/setup.md`.
- **`service-worker.js` `ASSETS` / `APP_VERSION`:** must list any new precached file and stay in sync with `?v=` import suffixes and `package.json` version (see `errors.md`).

## Orphans / special cases
- **`js/ui/siri-wave.js`** — not statically imported by any runtime module; only dynamically imported by `tests/e2e/app-ui.spec.mjs` and precached in `service-worker.js`.
- **`js/config/local-admin-token.js`** — not statically imported; fetched as text at runtime by `admin/readiness.js` (regex-extracted) and stubbed in tests. Gitignored (see `secrets.md`).
- **`js/vendor/*`** (`jsqr.js`, `qrcode-generator.mjs`, `streamsaver-adapter.js`) and **`workers/incremental-sha256.js`** are leaf modules.

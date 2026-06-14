# JS Audit

Scope: `js/`, `workers/`, `scripts/`, plus root `service-worker.js` because `js/app.js` registers it and `npm run check` includes it.

Graph note: Graphify was available, but graph traversal for this packet returned unrelated React/provider nodes instead of the requested static WebDrop `js/`, `workers/`, and `scripts/` surface. Reads were kept scoped to the packet-owned files and direct service-worker dependency.

Changed files: `.workflow/webdrop-audit-docs-qa/results/js-audit.md` only. No JS runtime files were edited.

## Findings

### High

1. Offline installs cache only `js/app.js` and two config modules, not the module graph that `app.js` imports.
   - Refs: `service-worker.js:16`, `service-worker.js:17`, `service-worker.js:18`, `service-worker.js:53`, `service-worker.js:55`, `js/app.js:1`, `js/app.js:10`
   - Impact: after the service worker installs, an offline reload can serve `./js/app.js` from cache but fail its ESM imports for `core/`, `services/`, `storage/`, `ui/`, and `utils/` because the fetch handler only returns cache hits or network responses and does not populate missing runtime cache entries. This breaks the app shell in the production/service-worker path even though the top-level module is cached.
   - Suggested fix: include every imported JS module and `workers/storage-worker.js` in `ASSETS`, or add a network-first/cache-fill strategy for same-origin JS module requests.

2. Peer names from signaling are injected into `innerHTML` without escaping.
   - Refs: `js/ui/app-view.js:277`, `js/ui/app-view.js:280`, `js/services/websocket-signaling.js:20`, `js/services/websocket-signaling.js:22`
   - Impact: mock peer names are trusted today, but the WSS adapter emits server-provided payloads directly into app state. If a production peer name contains markup, `renderPeers()` places it in a text span and an `aria-label` inside an HTML string, creating an XSS/markup-injection path.
   - Suggested fix: escape peer names before interpolating in `renderPeers()`, or build these peer nodes with DOM APIs and `textContent` / `setAttribute`.

### Medium

3. WebRTC preflight leaks peer connections/data channels across reconnects and disconnects.
   - Refs: `js/services/webrtc-transport.js:5`, `js/services/webrtc-transport.js:6`, `js/services/webrtc-transport.js:12`, `js/services/webrtc-transport.js:13`, `js/core/controller.js:202`, `js/core/controller.js:224`
   - Impact: each successful connect creates a new `RTCPeerConnection` and data channel, but disconnect only updates app/signaling state. Repeated connect/disconnect cycles can leave old ICE transports/channels alive until browser cleanup.
   - Suggested fix: add `WebRtcTransport.close()` that closes `channel` and `peerConnection`, clears fields, and call it during disconnect and before creating a replacement preflight connection.

4. Worker RPC promises can hang forever on worker errors, message errors, or terminated workers.
   - Refs: `js/storage/storage-client.js:6`, `js/storage/storage-client.js:11`, `js/storage/storage-client.js:27`, `js/storage/storage-client.js:32`, `workers/storage-worker.js:4`, `workers/storage-worker.js:24`
   - Impact: `StorageClient.call()` records pending resolvers and posts a message, but only normal worker `message` responses settle them. A clone error, worker crash, `messageerror`, or worker termination leaves callers stuck and leaks entries in `pending`.
   - Suggested fix: add `error`/`messageerror` listeners, a per-call timeout, and cleanup all pending calls when the worker is no longer usable.

5. Concurrent sends are not guarded.
   - Refs: `js/core/controller.js:140`, `js/core/controller.js:150`, `js/core/controller.js:154`, `js/core/controller.js:161`, `js/core/controller.js:166`
   - Impact: `sendSelectedFiles()` can be triggered again while an existing send is awaiting `transfer.send()`. A second invocation can replay the same selected files, race progress state, and append duplicate received items.
   - Suggested fix: return early when `store.getState().transfer` is already active, or track a send-in-flight flag and disable/ignore send controls until completion or cancellation.

### Low

6. The future WSS adapter has no malformed-message, close, or error handling.
   - Refs: `js/services/websocket-signaling.js:15`, `js/services/websocket-signaling.js:20`, `js/services/websocket-signaling.js:21`, `js/services/websocket-signaling.js:26`, `js/services/websocket-signaling.js:50`
   - Impact: invalid JSON throws inside the event listener, socket errors are not surfaced to controller state, and `send()` silently drops messages unless the socket is open. This is acceptable for an intentionally unconfigured stub, but should be closed before enabling production signaling.
   - Suggested fix: wrap parse in `try/catch`, emit adapter-level `error`/`closed` events, clear `this.socket` on close, and make send failures observable.

7. `npm run check` omits `scripts/`.
   - Refs: `scripts/check-js.mjs:5`, `scripts/check-js.mjs:6`, `scripts/capture-ui-elements.cjs:1`
   - Impact: the packet asks to audit scripts, but the repo check only walks `js` and `workers` plus root `service-worker.js`. Syntax regressions in `scripts/capture-ui-elements.cjs` would not be caught by the default check.
   - Suggested fix: include JS/CJS/MJS files under `scripts/` in `scripts/check-js.mjs`, while continuing to exclude non-JS generator scripts.

## Refactor Candidates

- `TransferEngine` is constructed with `{ transport, storage }`, but the constructor only keeps `storage` and `send()` never calls `transport.sendChunk()` or `storage.writeChunk()`. If this is intentionally a simulation, rename or document it; otherwise wire the actual transport/storage path. Refs: `js/app.js:57`, `js/services/transfer-engine.js:1`, `js/services/transfer-engine.js:24`, `js/services/webrtc-transport.js:30`.
- `futureSignaling` is passed into the controller but unused. Remove it until there is a runtime switch, or add a documented adapter-selection path. Refs: `js/app.js:52`, `js/app.js:63`, `js/core/controller.js:7`.
- DOM rendering mixes safe `textContent` in some paths with HTML-string rendering in others. Centralizing peer/file/chat rendering around small DOM helper functions would reduce future escaping mistakes. Refs: `js/ui/app-view.js:263`, `js/ui/app-view.js:340`, `js/ui/app-view.js:375`, `js/ui/app-view.js:395`.

## Check Evidence

- `npm run check` passed.
  - Runs `node scripts/check-js.mjs`.
- Per-file syntax check for packet JS/CJS/MJS files passed.
  - Command: `find js workers scripts -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print0 | xargs -0 -n1 node --check`
- Root service worker syntax check passed.
  - Command: `printf '%s\0' service-worker.js | xargs -0 -n1 node --check`

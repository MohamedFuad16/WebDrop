# Data Models, Formats & State

## UI state (the store)
Single observable object created in `js/app.js` via `createStore()` (`js/core/state.js`). Mutated only through `patch/update`; `AppView` subscribes and re-renders. Shape (initial state in `app.js`):
```js
{
  mode: "lobby" | "verifying" | "connected" | "disconnecting",
  self: { id, deviceId, name, avatar, avatarId, ringColor, deviceFamily },
  peers: [ /* normalized peers */ ],
  selectedPeerId, connectedPeerId, pendingInviteId, pairingId,
  incomingInvite: { peerId, pairingId, from, method, qrRole, receivedAt } | null,
  files: [ File ],                 // chosen for sending
  transfer: { direction:"send"|"receive", stage, name, ratio, transferredBytes, totalBytes, transferId } | null,
  capabilities: {}, path: "unknown"|"direct"|"relay",
  receivedCount, receivedItems: [ /* received file descriptors */ ],
  chatMessages: [ { id, author:"self"|"peer", text } ], unreadChatCount,
  signalingStatus: "connecting"|"online"|"offline",
  theme:"light"|"dark", locale:"en"|"ja", motionPaused
}
```
**Persistence (browser):**
- `localStorage`: `webdrop.deviceId`, `webdrop.deviceName`, `webdrop.avatarChoice`, `webdrop.ringColor`, `webdrop.theme`, `webdrop.locale`, `webdrop.motionPaused`, `webdrop.proximityPermissions` (mic/motion grants).
- Admin-only `localStorage`: `webdrop.adminTestRuns.v1` (`selectedTestCaseId`, live Pair A/B assignments, an optional active run, and up to 50 completed runs). Each run keeps its policy snapshot; this history is local to that browser.
- `sessionStorage`: `webdrop.clientId` (per-tab), `webdrop.adminToken` (admin dashboard).

## Peer model
Produced by signaling (`publicPeer` server-side) and normalized in `controller.normalizePeer()`:
```
{ id, deviceId, name/deviceName, avatar/avatarId, ringColor, deviceFamily, deviceLabel,
  online, connected, joinedAt, distanceBucket, proximityScore, stage, capabilities:{platform:{family,label,isIOS,isIPhone,dynamicIslandCapable},camera,qrScanner,webRtc} }
```
`sanitizePeers()` de-dupes by stable device key and drops self.

## Signaling messages (control plane)
JSON `{ type, targetId?, pairingId?, payload?|signal?|metrics? }`. Validated by `azure cloud server/src/message-schema.js`. Full type list + directions in `api.md`. Key limits: chat ≤2000 chars, ≤50 files/manifest, file name ≤240, SDP ≤64 KB, ICE candidate ≤4 KB, transfer total ≤500 MB, chunk ≤256 KB.

**Proximity metrics** (`proximity:telemetry` / `:session:telemetry`) — normalized score floats 0..1 plus acoustic detail: `soundCorrelation, motionCorrelation, bumpCorrelation, tiltMatch, qrMatch, tokenFresh, lowRttHint, acousticSignatureId, heardAcousticSignatureId, acousticSlot, acousticMarginDb, acousticDetections[…]`, etc.

**Proximity policy snapshot:** `{ revision, updatedAt, scoring:{ minimum, weights:{ sound,motion,bump,tilt,qr } }, timing:{ lateTapGraceMs, acousticWindowMs, matchSlopMs } }`. Defaults are weights `34/26/20/12/8`, minimum 55, and timing `6000/6000/4000` ms. Every session stores one immutable snapshot; the browser receives it in `proximity:start` and uses the same values. A pass still requires ultrasound+bump+tilt in addition to the configured minimum.

**Admin test run:** `{ id, caseId, caseTitle, status, startedAt, stoppedAt?, targetAttempts, notes, assignments:{clientId:"A"|"B"}, devices, policy, events, sessions }`. Derived summaries count correct and wrong assigned-pair matches, failed sessions, acoustic/bump/tilt pass rates, median score, and median bump delta. Raw events are bounded and de-duplicated because the diagnostics feed is polled repeatedly.

## Transfer protocol formats (data plane)
File `js/services/data-channel-transfer-protocol.js`.

**Manifest** (control channel JSON):
```
{ version:1, id, createdAt, totalBytes, files:[ { id, name, size, type, lastModified, sha256(64-hex) } ] }
```
**Chunk** (file channel): JSON header then one binary frame:
```
{ type:"file:chunk", transferId, fileId, sequence, offset, size, final }  + ArrayBuffer(size)
```
**Control msgs:** `transfer:manifest`, `transfer:ack` (stage `manifest`/`chunk`/`file`/`complete`, with `receivedBytes`/`offset`), `transfer:ready`, `transfer:complete` (`totalBytes`), `transfer:cancel`, `transfer:failed` (`reason`,`retryable`), `transfer:retry` (`fileId`,`offset`,`reason`).

**Progress event:** `{ transferId, fileId, name, transferredBytes, totalBytes, fileBytes, fileSize, ratio }`.

## QR pairing token
`js/services/proximity-token.js`: `wdp1.<base64url(JSON)>` where JSON = `{ version:1, sessionId, nonce, issuedAt, expiresAt }`. Default TTL 60 s; validated with ±5 s clock skew.

## Received file descriptor (UI)
Built in `controller` on `received`:
```
{ id, transferId, name, size(formatted), icon, type, storageBackend, sha256, ready,
  url(blob:|path), downloadName, status:"ready"|"saved", canSave }
```

## Storage persistence
`StorageClient` picks a backend per session (`selectBackend`): OPFS/IndexedDB (deferred, default desktop), StreamSaver streaming download, or in-memory Blob (iOS Safari, ≤128 MB). Session cap 500 MB. Chunks written in order keyed by `{sessionId,fileId,index}`; `finalize()` returns `{ files:[{fileId,name,receivedBytes,type,sha256,backend,blob?}] , receivedBytes }`. Cleanup on disconnect/`pagehide`.

# Engineer Guide

## Scope rules

For the docs/assets safety pass, runtime files are out of scope unless a narrow asset reference requires checking them.

## Navigation rules for this repo

Follow `AGENTS.md`: use graph traversal before large repository reads. If the graph is stale or unrelated, record that finding and keep direct file reads scoped to the active packet.

Before any future edit, inspect the current relevant files first. This repo has architecture notes and generated-looking artifacts that can easily drift from intended product behavior, so avoid assuming that a folder name implies an implemented subsystem.

The deployed site at `https://web-drop-lyart.vercel.app/` may be used as a product reference. It should not be copied wholesale, treated as the source of truth for local code, or cloned into this checkout.

## Current implementation facts

As of this pass:

- The active local runnable artifact is `index.html`.
- The visible app/package/service-worker version is `1.0.71`.
- The old architecture HTML page was deleted during the corrected rebuild.
- `js/app.js` boots the modular static app.
- `js/admin/readiness.js` boots the production-readiness console.
- `js/admin/diagnostics.js` and `diagnostics-api.js` own the live diagnostics page without coupling it to the main app controller.
- `js/admin/operations-i18n.js` and `css/operations.css` keep readiness, live testing, and diagnostics on one English/Japanese operations system.
- Live acoustic debugging comes from bounded device telemetry in the server snapshot. The removed browser-local acoustic lab must not be reintroduced as a substitute for physical phone evidence.
- `js/core/controller.js` owns the state transitions that gate file controls.
- `js/storage/storage-client.js` owns deferred IndexedDB receive chunks, byte-count checks, StreamSaver export on Save, iPhone/iPad Blob fallback, cleanup, and the 500 MB receive-session cap.
- `azure cloud server/` owns the deployable signaling backend package; it coordinates metadata only and must not carry file bytes.
- The repository is a Git working tree from this directory; preserve unrelated local changes.

Update these facts when the runtime structure changes.

## UI implementation contract

The self/user icon must be centered in the orbital UI.

Implementation guidance:

- Treat the local user as the origin of the orbit, not as an orbiting item.
- Keep the self/user icon anchored in the center across desktop and mobile layouts.
- Position peers around that center by state and confidence.
- Ensure peer animations cannot push or visually displace the centered self icon.

Folder, send, and receive controls must only appear after a connected state.

Implementation guidance:

- Hide file-transfer controls during searching, available, invited, and verifying states.
- Show transfer controls only for a selected connected peer.
- The folder/tray must be absent from the first screen and must only appear when `mode === "connected"`.
- If there is no selected connected peer, the primary UI should stay in discovery, pairing, or connection guidance mode.
- Avoid showing send/receive action sheets as a generic first-screen affordance.

## State machine reference

Use explicit states rather than independent booleans:

```text
idle
searching
available
inviting
verifying
connected
transferring
complete
failed
```

Controls by state:

- `idle`, `searching`: show local identity, QR access, and discovery status.
- `available`: show peers and invite affordance.
- `inviting`, `verifying`: show pairing progress and cancellation.
- `connected`: show folder, send, and receive controls.
- `transferring`: show progress, cancel, and transfer details.
- `complete`, `failed`: show result and recovery action.

## Architecture invariants

Keep these boundaries stable:

- WebSocket signaling carries metadata only.
- WebRTC `RTCDataChannel` carries file chunks.
- TURN is fallback transport, not the default happy path.
- Relay mode should be capped and disclosed.
- Receiver storage defers DataChannel chunks in IndexedDB where supported, exports them only after Download, and uses capped Blob assembly on iPhone/iPad.
- Large received files are capped at 500 MB per receive session.
- QR remains the universal fallback when audio or motion permissions are unavailable.

## Verification checklist

For future runtime edits, verify:

- The self/user icon remains visually centered at mobile and desktop sizes.
- Send/receive controls are absent before connected state.
- Send/receive controls appear for a selected connected peer.
- No file bytes are sent through signaling code.
- Receiving a file must not start a browser download. The receive badge appears first; Download hands IndexedDB chunks to the browser, while iPhone and iPad use Open to preview the capped Blob in a separate tab.
- Relay mode applies a clear cap and user-facing explanation.

## Production handoff reminders

- Keep `productionSignaling=false` and production URLs blank until the Azure signaling service is deployed.
- Configure long-lived Cloudflare TURN credentials only in the Azure VM environment file.
- Run physical iOS/Android calibration before enabling proximity enforcement server-side.
- Keep any WebSocket message additions schema-validated and metadata-only.
- Keep `/api/diagnostics-snapshot` behind `METRICS_API_TOKEN`. `/api/diagnostics-public` may be unauthenticated only because it returns bounded metadata and never raw microphone audio.

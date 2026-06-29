# Architecture Decision Records (ADRs)

Append-only. Newest at the bottom. Format: ID · date · title · status · context · decision · consequences. These initial ADRs are **reverse-engineered** from the existing architecture to capture the rationale evident in the code.

---

## ADR-0001 · 2026-06-29 · Use WebRTC data channels for file transfer
**Status:** Accepted (in code)
**Context:** WebDrop transfers user files (up to 500 MB) between two devices that are physically near each other. Routing file bytes through a central server is costly, slow, and a privacy concern.
**Decision:** Send files **peer-to-peer over WebRTC `RTCDataChannel`** (`js/services/webrtc-transport.js` + `data-channel-transfer-protocol.js`). The WebSocket server is used only for the control plane (presence, invites, SDP/ICE relay, telemetry); it explicitly **rejects binary frames**. Two ordered channels separate control (`webdrop-control-v1`) from file bytes (`webdrop-file-v1`), with a manifest+chunk+ack protocol, SHA-256 integrity, backpressure, and retries.
**Consequences:** Direct/relay path depends on NAT and TURN availability (see `errors.md`); needs a TURN broker for symmetric NATs. Keeps bytes off the server and scales the data plane horizontally for free. Adds protocol complexity (ordering, retry, caps) the app must own.

---

## ADR-0002 · 2026-06-29 · Provide a mock signaling + simulated runtime fallback
**Status:** Accepted (in code)
**Context:** Real signaling, proximity (ultrasound/motion), and transfer require a deployed server, real hardware, and two devices — terrible for UI iteration and CI.
**Decision:** Define one signaling interface implemented by both `WebSocketSignalingAdapter` (production) and `MockSignalingAdapter` (in-memory, 15 fake peers, simulated invites/proximity/QR/RTC). Runtime flags (`runtime-flags.js`/`runtime-config.js`) select the adapter and gate `realProximityCeremony`/`realTransfer`/`qrPairing`; `?runtime=mock` forces mock on localhost.
**Consequences:** The entire UI runs offline with zero backend. Risk: developers may think they're hitting production when they're on mock (documented in `errors.md`). Mock and real paths must be kept behaviorally aligned.

---

## ADR-0003 · 2026-06-29 · Multi-factor physical-proximity verification (ultrasound + motion, QR fallback)
**Status:** Accepted (in code)
**Context:** "Nearby" must mean physically present, not merely on the same signaling server, to prevent remote impersonation/relay attacks during pairing.
**Decision:** Run a **ceremony** combining ultrasonic chirp exchange (`acoustic-proximity.js`), DeviceMotion bump+tilt (`motion-proximity.js`), and an optional QR token (`proximity-token.js`), scored by `proximityScore`. A pass requires score ≥ 55 **and** ultrasound+bump+tilt present (`hasRequiredPhysicalEvidence`), mirroring the authoritative server gate. QR pairing is the explicit fallback when sensors are unavailable.
**Consequences:** Strong proximity assurance; but hardware/permission/secure-context dependent and brittle on some devices (see `errors.md`). The client must not over-report success vs the server, hence the duplicated gate.

---

## ADR-0004 · 2026-06-29 · Ship as a no-build static PWA with a layered storage ladder
**Status:** Accepted (in code)
**Context:** The app targets mobile browsers (esp. iPhone) and must be cheap to host, installable, offline-capable, and able to save large received files despite divergent browser storage support.
**Decision:** No bundler/transpiler — plain ES modules served statically (`scripts/static-server.mjs`), versioned via `?v=<APP_VERSION>` and a precaching `service-worker.js`. Received files use a capability/size-selected backend ladder in `StorageClient`: OPFS/IndexedDB (deferred) → StreamSaver streaming → in-memory Blob (iOS, ≤128 MB).
**Consequences:** Zero build pipeline, trivial deploy, instant module reloads — but no tree-shaking/minification and manual cache-version discipline (bump in several places). Storage behavior differs by platform; iOS large transfers are capped.

---

## ADR-0005 · 2026-06-29 · Render the architecture diagram with D2's ELK engine
**Status:** Accepted
**Context:** `graph/architecture.d2` was rendered with D2's default `dagre` layout, which routed connectors straight through boxes and swept long curved edges across the canvas (notably the `transfer → transport.protocol` `sendFiles` edge), making the diagram hard to read.
**Decision:** Render with the **ELK** layout engine (orthogonal edge routing, avoids node overlap) — applied both in the source (`vars.d2-config.layout-engine: elk`, `pad: 40`, `center: true`, `direction: down`) and via the CLI (`d2 --layout elk --pad 40`). Adopt clean-layout authoring rules: containers ordered top-to-bottom in data-flow order, tightly-coupled nodes in the same container, hub node (`controller.js`) kept central, short single-line labels, no manual `near` constraints, and nodes repositioned (e.g. `transfer-engine.js` next to the transport nodes, admin next to Azure) rather than crossing the canvas with long edges. ELK is open-source and bundled with d2; the proprietary `tala` engine was rejected.
**Consequences:** The diagram is clean — no connector crosses a box, no containers overlap. The same change was baked into the `agent-folder` skill (render script + template + docs) so future diagrams render cleanly by default. Authors must keep `.d2` sources flow-ordered for ELK to produce the best layout.

---

## ADR-0006 · 2026-06-30 · Personalize the connection QR with an avatar badge (level H)
**Status:** Accepted (in code)
**Context:** The "Show this code nearby" QR was a generic coloured matrix. Product wanted it to feel personal (per-user) without hurting scannability or adding latency to the pairing ceremony.
**Decision:** Render the QR at **error-correction level "H"** (~30% recovery) instead of "M", then composite the user's avatar as a rounded centre badge sized to ~24% of the code over a white "knockout" quiet zone (`DynamicIsland.drawQr(token, avatar)`). Avatar images are decoded once and kept in a module-level `qrLogoCache`, so a warm badge paints synchronously in the same frame as the modules — no async gap before a scan. A node test (`tests/qr-personalized.test.mjs`) reproduces the exact geometry into an RGBA buffer and asserts `jsQR` still decodes the original token, so the personalization can never silently break pairing.
**Consequences:** The code is denser at level H (smaller cells for the same token) but still scans comfortably at the rendered size, and the centre logo is well within H's recovery budget. Any future change to badge size / knockout padding must keep the decode test green. The same `drawQr` path is used only for the *display* QR; the scanner path is unaffected.

# Agent History

## 2026-06-15 Production readiness, disabled by default

Scope:
- Used graph-first navigation, a four-packet dynamic workflow, and separate final audits for proximity, WebRTC/transfer, storage workers, and checklist coverage.
- Removed the obsolete `gemini-code-1781434503037.md`.
- Kept production WSS, TURN, real proximity, QR pairing, and real transfer disabled by default.

Implementation:
- Added a real explicit-gesture microphone and motion permission ceremony.
- Added coordinated two-peer Web Audio chirp exchange, real correlation, tilt/bump capture, motion reset, and sensor cleanup.
- Added backend `proximity:ready` / `proximity:start` coordination and verified-only enforcement before RTC, chat, path metrics, and transfer metadata.
- Added production runtime configuration with dependency-safe flags.
- Added offer/answer/ICE routing, one-offerer pairing roles, receiver data channels, separate control/file channels, backpressure, manifests, ACK/cancel/retry/progress, and durable completion ACK.
- Added sender-side incremental SHA-256 and receiver worker hash/byte verification.
- Added OPFS-first worker writes, IndexedDB fallback, capped memory fallback, quota checks, OPFS failure fallback, export, abort, and cleanup commands.
- Added backend QR token logic, strict schemas, pairing sessions, Cloudflare TURN credential proxy, path metrics, and payload-safe observability.
- Added `docs/production-activation.md` and `docs/implementation-checklist.md`.

Verification:
- Root `npm run check` and `npm test` passed with 10 tests.
- AWS backend `npm run check` and `npm test` passed with 20 tests.
- `git diff --check` passed.
- Browser smoke passed on default desktop and 393x852 mobile viewports with seven peers, hidden pre-connection tray, working peer sheet, and no console warnings/errors.
- External work remains: EC2 deployment, rotated TURN credentials, real WSS/TURN URLs, staged flag activation, physical-device calibration, two-browser direct/TURN transfer, and load testing.

## 2026-06-14 Documentation correction

Scope:
- Created documentation only.
- Did not edit `proximity_architecture_monkeytype_v2.html`, `js/`, `workers/`, or other runtime artifacts.
- Did not use Graphify for this pass, per corrected user instruction.

Files inspected before editing:
- `proximity_architecture_monkeytype_v2.html` (removed later during corrected rebuild)
- `gemini-code-1781434503037.md`
- `docs/`
- `js/`
- `workers/`
- `assets/`

Observed repository state:
- The local checkout initially contained a single static architecture page: `proximity_architecture_monkeytype_v2.html`.
- `docs/` existed but was empty before this pass.
- `js/` contains empty module directories and no implementation files.
- `workers/` exists but contains no worker files.
- Existing Graphify artifacts are present under `graphify-out/`, but they were intentionally not used.

Reference handling:
- `https://web-drop-lyart.vercel.app/` was treated as a product reference only.
- The reference surface shows WebDrop-style QR pairing, searching/discovery state, settings, and send/receive actions.
- The reference was not cloned or copied into local runtime files.

Corrected architecture decisions recorded:
- The self/user icon is the fixed center of the orbital UI.
- Peer devices orbit around the centered self/user icon by state and confidence.
- Folder, send, and receive controls are hidden until the app reaches a connected state with a selected peer.
- Discovery, searching, available, and verification states must not expose file-transfer controls.
- Signaling carries presence, invite, session, proximity, and ICE metadata only.
- File payloads move over WebRTC `RTCDataChannel`, with TURN relay as a fallback and relay-mode caps.
- Receiver storage should stream chunks to OPFS first, IndexedDB second, and memory only for small files.

## 2026-06-14 Corrected runtime rebuild

Scope:
- Deleted the incorrect folder-centered HTML/CSS implementation attempt.
- Rebuilt the static app directly from files, without Graphify.
- Used `https://web-drop-lyart.vercel.app/` only as a mobile-first reference for black canvas, orbit language, status rail, and bottom-sheet behavior.
- Did not copy the reference UI or preserve its centered-folder layout.

Runtime implemented:
- `index.html` is an app shell.
- `css/` is split by base, orbit, connected controls, sheets, and responsive behavior.
- `js/` is split into state, controller, UI, signaling adapters, proximity, WebRTC, transfer, storage, and utilities.
- `workers/storage-worker.js` handles receive-session storage messages.
- `service-worker.js` caches the static shell.
- The earlier `proximity_architecture_monkeytype_v2.html` file was deleted per the instruction to remove old HTML/CSS and redo from scratch.

Corrected UI invariant:
- The self/user avatar is the center of the orbital UI in every state.
- Peers orbit around the centered self/user avatar.
- The folder/file tray is hidden in lobby, invite, and verification states.
- Folder, send, receive, and disconnect controls appear only after `mode === "connected"`.

Agent status:
- Two workers were restarted after the correction.
- Documentation worker completed `agenthistory.md`, `docs/architecture.md`, and `docs/engineer-guide.md`.
- Verification/docs worker completed `assets/diagrams/orbital-ui-state-gating.md` plus reference/current screenshots. Its local screenshot targeted the old static architecture page and is historical gap evidence, not the new app state.

## 2026-06-14 Reference UI orbit repair

Scope:
- Reworked the reference-styled mobile UI after screenshot review from the in-app browser.
- Kept the app static and vanilla JS.
- Used the required graph traversal first; the graph index returned unrelated/stale React nodes, so edits stayed narrowly scoped to the known static app files.

Files changed:
- `index.html`
- `css/base.css`
- `css/orbit.css`
- `css/connected.css`
- `css/sheets.css`
- `css/responsive.css`
- `js/app.js`
- `js/core/controller.js`
- `js/ui/app-view.js`

Fixes completed:
- Centered the orbit as a viewport-bounded square so the self avatar, peer icons, and all four rings remain visible on phone widths.
- Removed the capability footer row (`Mic`, `WS`, `Tilt`, `Bump`, `Ultra`) from the UI.
- Replaced the floating "send a message" composer with a connected-only bottom dock containing exactly three icon actions: send files, received files, and chat.
- Added separate soft bottom sheets for send, receive, and chat actions.
- Kept the receive badge hidden until `receivedCount > 0`; opening the receive sheet does not create a fake receive.
- Fixed peer avatar treatment so orbit avatars use the same circular profile style as the nearby-candidate friend strip.
- Added smooth orbit animation for peer nodes, with reduced-motion support preserved.
- Replaced the settings sheet close affordance with a compact icon button matching the sheet style.
- Removed nonessential connection toasts so they do not cover the bottom dock.

Verification evidence:
- `npm run check` passed.
- Local static server switched from Python `http.server` to a Node static server with `Cache-Control: no-store` for stable browser QA.
- Browser smoke was run at mobile viewports matching iPhone/Android classes: 360x800, 390x844, 412x915, and 430x932.
- Evidence across those viewports: `peerCount: 4`, `visiblePeers: 4`, `overflowX: false`, dock hidden before connection, dock visible after swipe connection, and dock button count `3`.
- Final 390x844 center metrics: lobby `selfCenterDelta: [0, 0]`; connected `selfCenterDelta: [0, 0]`; receive badge hidden initially; capability/footer text absent; composer text absent.
- Screenshots saved:
  - `assets/screenshots/fixed-orbit-lobby-light.png`
  - `assets/screenshots/fixed-orbit-connected-light.png`
  - `assets/screenshots/fixed-send-sheet-light.png`
  - `assets/screenshots/fixed-chat-sheet-light.png`

## 2026-06-14 Orbit motion and profile refinement

Scope:
- Refined the accepted light/dark WebDrop visual system without generating a replacement concept.
- Started the local Node static server on `127.0.0.1:4180` with `Cache-Control: no-store`.
- Used the required graph traversal first; the graph remained stale and unrelated, so edits stayed scoped to the static orbit, sheets, state, controller, and mock signaling files.

Implementation:
- Replaced generic gray dotted circles with four softly colored segmented rings aligned to lobby, invite, verification, and nearby radii.
- Removed the self-avatar online pin that appeared as a stray dot.
- Added a settings profile-picture control with square center-cropping, 256px WebP encoding, preview, and local persistence.
- Added animated enter/exit states for peer, settings, send, receive, and chat sheets plus backdrop fade.
- Changed connected identity geometry to two equal-size overlapping avatars with shared halo and breathing animations.
- Connected peer avatar now acts as the disconnect control.
- Enforced one active peer connection: selecting a second peer is blocked until disconnect.
- Expanded mock presence to five peers and added `assets/icons/avatar-sora.svg`.
- Distributed mock peers across all four ring depths with a shared orbital cadence and stable phase spacing.
- Hid orbit labels until hover/focus; device identity copy now sits below the orbit boundary to keep moving paths unobstructed.
- Moved transient toast notifications below the header so they do not cover sheets or the bottom dock.

Verification:
- `npm run check` passed throughout the final pass.
- Profile upload test confirmed WebP data URL rendering, matching preview, and `localStorage` persistence.
- Sheet tests confirmed open state, interpolated closing state, delayed hidden state, and backdrop cleanup.
- Connected geometry at 390x844: self `78x78`, peer `78x78`, overlap `33px`, animations `connectedBreathe` and `connectionHalo`.
- Second-peer test preserved the Aki connection and displayed the one-at-a-time warning without opening another peer sheet.
- Time-sampled orbit QA ran across 360x800, 390x844, and 430x932 with five peers and four rings.
- Final sampled result across all three viewports: zero peer/self contacts, zero peer/peer contacts, zero peer/topbar or peer/identity-copy contacts, zero clipping, and zero horizontal overflow.
- Screenshots saved:
  - `assets/screenshots/motion-five-peer-lobby.png`
  - `assets/screenshots/motion-connected-venn.png`
  - `assets/screenshots/motion-settings-profile.png`
  - `assets/screenshots/motion-send-sheet.png`

## 2026-06-14 Five-ring and supplied-avatar correction

Scope:
- Followed graph-first navigation. The available graph remained stale for this static app, so file reads stayed limited to the orbit, settings, controller, mock signaling, cache, and directly connected styles.
- Used `assets/icons/user_icons.png` as the approved profile source and extracted eight square avatar assets into `assets/icons/avatars/`.

Implementation:
- Replaced the four stage-sized rings and decorative pulse circles with five explicit orbit lanes using one shared dash pattern, thickness, opacity, and animation cadence.
- Decoupled peer placement from invite/proximity state. The first five mock peers occupy five distinct rings; two additional peers share the outer lanes at fixed opposite phases.
- Expanded mock presence to seven peers and moved every peer plus the current user onto the supplied avatar set.
- Reserved the center during a connection: the connected peer is removed from orbit rendering, the remaining six peers move to outer-safe slots, and the center contains exactly two equal-size Venn avatars.
- Removed the top-left status dot and changed the subtitle to `Connected with <name>` while a session is active.
- Replaced profile uploads with an eight-item horizontal swipe carousel and five selectable ring colors. White is the default; avatar and ring choices persist locally.
- Added a fixed 14px idle gap between the send sheet's file chooser and Send button.
- Bumped the production service-worker cache to `webdrop-v2-static-6`.

Verification:
- `npm run check` and direct `node --check` module validation passed.
- Live browser QA used `http://127.0.0.1:4180/` with no console errors or warnings.
- Mobile viewport checks passed at 360x800, 390x844, 412x915, and 430x932: five rings visible, seven peers visible, no peer contacts, no horizontal overflow, and no topbar collision.
- The first five peer ring indices were `0, 1, 2, 3, 4`.
- Connected QA: Aki was absent from the orbit DOM, six peers remained outside the center, the Venn avatars were equal size with a 28px overlap, and the status read `Connected with Aki`.
- One-peer enforcement kept the Aki connection active when Ren was selected and displayed the disconnect-first notice.
- Settings QA rendered eight avatar choices and five ring swatches; icon and ring changes survived reload. The browser was restored to the first avatar and default white ring after testing.
- Send-sheet QA measured a 14px gap between `Choose files` and `Send`.

## 2026-06-14 Four-ring App Clip motion and localization refinement

Scope:
- Used graph traversal first; the graph index remained stale and unrelated, so implementation reads stayed limited to the known static WebDrop UI, controller, state, mock signaling, cache, and styles.
- Delegated a bounded read-only animation research packet and integrated its source-backed recommendations.
- Added the user's follow-up settings pagination and orbit-alignment corrections during the same live QA pass.

Implementation:
- Moved the device name to the exact top-center position between the WebDrop status and right-side controls.
- Removed the redundant searching status below the device name and removed duplicate Light/Dark controls from Settings.
- Replaced five conic dotted rings with four rounded SVG capsule-dash rings inspired by the visual language of App Clip codes.
- Increased ring separation, enlarged the innermost blue ring, and aligned peer paths to the exact SVG circle-radius formula.
- Removed peer labels from orbit layout flow and positioned them absolutely, eliminating the transform-center displacement.
- Added complete English/Japanese localization for static copy, dynamic connection text, all sheets, empty states, placeholders, file labels, toasts, and accessibility labels.
- Added a persisted language selector and a persisted orbit-motion pause control.
- Moved Design reference and Service status into a dedicated App information sheet with Back and Close controls.
- Increased profile-icon carousel spacing to 13px with 8px top and 12px bottom safety padding.
- Refined sheet motion to 340ms open / 240ms close, backdrop motion to 180ms / 140ms, transition-completion cleanup, transform/opacity-only continuous motion, a single connected halo pulse, and targeted reduced-motion behavior.
- Bumped the production service-worker cache to `webdrop-v2-static-8`.

Verification:
- `npm run check` and direct module syntax validation passed.
- Browser QA verified English and Japanese settings, information, peer connection, send, receive, and chat sheets.
- Information pagination preserved the backdrop, hid the previous sheet, supported Back, and supported direct Close.
- Four-phone matrix passed at 360x800, 390x844, 412x915, and 430x932.
- Every viewport reported four rings, seven peers, zero peer contacts, zero adjacent-lane contacts, zero horizontal overflow, zero topbar overlap, and exact top-center device status.
- After removing peer labels from layout, all peer portraits measured `0px` maximum radial path error.
- Innermost blue-ring clearance measured 12.6px, 11.6px, 12.2px, and 13.8px across the four tested viewports.
- Browser console reported no warnings or errors.
- The final app state was restored to an English lobby with orbit motion enabled.

## 2026-06-15 Receive PDFs and file-flow polish

Scope:
- Followed graph-first navigation before file reads. The current graph index was still stale for the live UI modules, so reads stayed scoped to the known app shell, view, controller, styles, i18n, and service worker.
- Attempted the requested subagent for screenshot/PDF inventory, but the subagent failed because its refresh token was revoked. Completed the packet sequentially in this thread.

Implementation:
- Fixed the empty send rail so the swipe thumb no longer overlays `Choose files first`.
- Replaced the choose-file glyph with a cleaner document-plus icon and verified it does not overlap the label.
- Added a fourth connected dock action for direct disconnect with a red link-break icon.
- Moved Orbit motion into App information and replaced the old Reference use / Service status rows with app-specific cards.
- Fixed device-name editing so the final character can be deleted without immediately restoring `WebDrop Device`.
- Added localized demo PDF entries to the receive sheet, filtered by current app language, and made the Open action a real link.
- Created 29 UI-element screenshots under `output/screenshots/ui-elements/`.
- Generated `output/pdf/webdrop-demo-en.pdf` and `output/pdf/webdrop-demo-ja.pdf` as 17-page demo guides with overview, stack, and UI-element explanations.
- Bumped the production service-worker cache to `webdrop-v2-static-10` and cached the two PDF deliverables.

Verification:
- `npm run check` passed.
- Direct `node --check` passed for the edited JS modules and service worker.
- Final Playwright QA used system Chrome against `http://127.0.0.1:4180/` with no console errors and no failed requests.
- Device-name QA confirmed an empty input remains empty while editing, then `Fuad Mac` updates the top-center device label.
- Send-sheet QA measured an 8px gap between the file-plus icon and `Choose files`, with no overlap; the empty send swipe thumb opacity was `0`.
- Receive-sheet QA showed only `WebDrop Demo Guide EN.pdf` in English and only `WebDrop デモガイド JP.pdf` in Japanese.
- The linked English and Japanese PDFs returned HTTP 200 from the local server.
- App information contained Orbit motion and no longer contained Reference use or Service status.
- The new dock disconnect button returned the app to lobby mode.
- PDF QA rendered Quick Look thumbnails for both PDFs and extracted text with `pypdf`; both PDFs contained 17 pages.

## 2026-06-15 Context-focused avatar motion review

Scope:
- Paused all PDF regeneration at the user's request until the live avatar motion is approved.
- Followed graph-first navigation; the graph result was unrelated/stale, so reads stayed scoped to the peer sheet, app view, avatar styles, and service worker.

Implementation:
- Corrected the source-sheet interpretation from an invalid 4x2 sprite assumption to the actual 3x2, six-expression layout.
- Added `scripts/build-avatar-frames.py` and generated 48 centered, circular, transparent PNG frames under `assets/icons/animated/`.
- Removed checkerboard backgrounds, blank frames, partial faces, and displaced sprite positioning.
- Changed expression motion to a 36-second eased cycle, holding each expression for roughly six seconds.
- Limited expression animation by context:
  - Lobby center/self avatar: animated.
  - Orbiting nearby peers: static.
  - Connected Venn pair: static and equal-size.
  - Connect-sheet selected candidate and friend strip: animated.
  - Settings profile-icon carousel: animated.
- Added the selected peer's animated profile beside the Nearby candidate name.
- Fixed connect-swipe overlap by reserving separate text space and hiding the label immediately while the thumb is moving.
- Bumped the service-worker cache to `webdrop-v2-static-13`.

Verification:
- `npm run check` passed.
- Browser QA used system Chrome at 430x932 with no failed requests, warnings, or errors.
- Lobby measured six center frames, zero orbit animation frames, and seven static orbit avatars.
- Connect sheet measured six selected-candidate frames and five animated friend icons.
- Settings measured eight animated profile choices with 48 total frames.
- Connected mode measured zero expression-animation frames and one static image for each equal-size Venn avatar.
- Connect-sheet layout and swipe separation passed at 393x852, 430x932, 412x915, and 360x800.
- PDF screenshot capture and PDF regeneration remain pending explicit user approval.

## 2026-06-15 Locale, chat, connected spacing, and 1.0.3 PDF finalization

Scope:
- Followed graph-first navigation first. The graph index remained stale/unrelated, so reads stayed scoped to the known WebDrop app shell, controller, view, locale config, orbit/chat CSS, screenshot capture, PDF generator, and service worker.
- Continued the approved PDF packet after the user authorized PDF generation, with independent visual QA.

Implementation:
- Fixed the vertical swipe-to-send rail so the thumb no longer overlaps the text after a file is selected.
- Added `App version` / `1.0.3` at the bottom of Settings and localized it.
- Added browser-language detection:
  - Japanese browser locale selects Japanese.
  - English browser locale selects English.
  - Unsupported browser locale falls back to English.
  - Manual language switching still stores `webdrop.locale` in `localStorage` and overrides browser language on later loads.
- Reworked the chat sheet into a scrollable bubble conversation with outgoing blue bubbles, incoming soft bubbles, smooth scroll-to-bottom, and a mock peer reply.
- Reduced the connected Venn avatars in connected mode and expanded the innermost blue ring so the ring remains visible behind the pair.
- Slowed and softened disconnect dissolve timing from an abrupt removal to a longer blur/fade/scale release.
- Hardened pointer capture so synthetic QA swipes cannot throw when a pointer is not capturable.
- Refreshed `output/screenshots/ui-elements/` with 30 current screenshots, including the updated chat bubble sheet and connected ring spacing.
- Rebuilt `output/pdf/webdrop-demo-en.pdf` and `output/pdf/webdrop-demo-ja.pdf` as 23-page guides from the current screenshots.
- Updated PDF presentation assets for dock icons so receive and disconnect no longer show clipped screenshot backgrounds.
- Bumped the service-worker cache to `webdrop-v2-static-16`.

Verification:
- Local static server is running at `http://127.0.0.1:4180/`.
- `npm run check` passed.
- Direct syntax checks passed for edited JS, capture script, service worker, and PDF generator.
- Browser QA confirmed:
  - `ja-JP` without stored locale renders Japanese.
  - `en-US` without stored locale renders English.
  - `fr-FR` without stored locale falls back to English.
  - Stored `ja` overrides English browser locale.
  - Stored `en` overrides Japanese browser locale.
  - Connected Venn avatars are equal at ~73px and have ~22px horizontal / ~44px vertical inner-ring clearance.
  - Chat generated 3 outgoing and 3 incoming bubbles, remained scrollable, and stayed at the bottom.
  - Disconnect entered `disconnecting` mid-animation and returned to `lobby` after the dissolve.
  - Browser errors were zero after pointer-capture hardening.
- PDF verification:
  - `output/pdf/webdrop-demo-en.pdf`: 23 pages, version 1.0.3 present, overview/architecture/chat/roadmap text present.
  - `output/pdf/webdrop-demo-ja.pdf`: 23 pages, version 1.0.3 present, overview/architecture/chat/roadmap text present.
  - Poppler rendered all 46 PDF pages to PNG.
  - Independent QA agent reviewed all rendered pages and returned PASS after the final icon-crop fix.

## 2026-06-15 Japanese PDF font and localized screenshot correction

Scope:
- Corrected the Japanese PDF typography and screenshot source before publishing the project to GitHub.
- Kept graph-first navigation first; the graph result was stale/unrelated, so reads stayed scoped to the screenshot capture and PDF generator scripts.

Implementation:
- Added a PDF-ready Source Han Sans JP static Normal font at `assets/fonts/SourceHanSansJP-Normal-static.ttf`.
- Updated the PDF generator so Japanese pages embed `SourceHanSansJP-Normal`.
- Made UI screenshot capture locale-aware:
  - English screenshots now go to `output/screenshots/ui-elements-en/`.
  - Japanese screenshots now go to `output/screenshots/ui-elements-ja/`.
- Updated PDF generation so the English guide uses English screenshots and the Japanese guide uses Japanese app screenshots.
- Removed the legacy mixed `output/screenshots/ui-elements/` folder to avoid future inventory confusion.
- Regenerated `output/pdf/webdrop-demo-en.pdf` and `output/pdf/webdrop-demo-ja.pdf`.

Verification:
- `npm run check` passed.
- `node --check scripts/capture-ui-elements.cjs` passed.
- `python3 -m py_compile scripts/generate-demo-pdfs.py` passed.
- Rendered both PDFs to PNG pages: 23 English pages and 23 Japanese pages.
- Confirmed the Japanese PDF embeds `SourceHanSansJP-Normal`.
- Visually checked the Japanese contact sheet; UI screenshots are now Japanese app screens.

## 2026-06-15 Connection haptic progressive enhancement

Scope:
- Inspected Project Fathom's deployed bundle and public source to verify its iOS haptic technique.
- Traced WebDrop's existing swipe-to-connect and successful connection transition after a graph-first query returned an unrelated stale graph result.

Implementation:
- Added a real WebKit native switch control directly over the visible connect thumb while preserving the custom swipe UI.
- Kept the switch's native appearance intact, made it transparent, and clipped its hit area to the thumb.
- Allowed the switch to toggle only after a completed connect swipe, then reset it without firing a second interaction.
- Added a single 28 ms `navigator.vibrate()` pulse after the connection state becomes successful on browsers that support the Vibration API.
- Bumped the service-worker cache to `webdrop-v2-static-18` for this packet; later packets supersede it with revision `20`.

Limitations:
- Safari's switch haptic requires a direct user interaction. It cannot be fired later from script on iOS 26.5+, so the iPhone tick is attached to the user's successful confirmation swipe rather than the asynchronous WebRTC completion callback.
- Desktop browser automation can verify touch-target geometry and state transitions, but not physical device vibration.

Verification:
- JavaScript syntax checks passed across `js/`, `workers/`, and `service-worker.js`.
- A controller harness confirmed exactly one haptic pulse after a successful connection.
- Browser QA at 393x852 confirmed the invisible switch and visible thumb share the same 48x48 bounds.
- A short tap left the app in lobby mode and the switch unchecked.
- A completed swipe reached connected mode, showed `Connected with Aki`, exposed the connected action tray, reset the switch, and produced no browser warnings or errors.

## 2026-06-15 Equal connected orbit spacing and disconnect haptic

Scope:
- Rebalanced connected-mode ring geometry around the wider two-avatar Venn cluster.
- Added direct-touch disconnect feedback and hardened connection feedback against duplicate completion events.
- Ran local rendered QA before three independent functional, performance, and static review packets.

Implementation:
- Derived the innermost connected ring from `--connected-avatar`, then distributed the remaining rings outward at equal radial intervals.
- Updated connected peer orbit radii to match the recalculated visible paths.
- Added a transparent native WebKit switch over the bottom disconnect control while retaining the underlying keyboard-accessible button.
- Added a 34 ms Vibration API fallback when disconnect begins.
- Added a single-flight verification guard that captures the selected peer and ignores duplicate or stale connection completions.
- Matched the disconnect haptic wrapper to the 50 px narrow-screen dock size below 380 px.
- Bumped the service-worker cache to `webdrop-v2-static-19`; the follow-up performance/cache packet supersedes it with revision `20`.

Verification:
- `npm run check`, direct `node --check`, and `git diff --check` passed.
- A concurrency harness confirmed three simultaneous connect events produce one ceremony and one connection pulse.
- Duplicate disconnect events produce one disconnect pulse.
- At 393x852, connected ring gaps measured 27.95 px, 27.95 px, and 27.96 px.
- At 430x932, connected ring gaps measured 30.58 px, 30.59 px, and 30.59 px.
- At 412x915, connected ring gaps measured 29.30 px, 29.30 px, and 29.31 px.
- The innermost ring retained 16.3-17.8 px clearance around the connected cluster across those devices.
- All remaining peer centers measured on their assigned recalculated ring paths.
- The disconnect haptic hit area exactly matched the visible button, entered `disconnecting`, returned to `lobby`, and reset unchecked.

## 2026-06-15 Version 1.0.3 spacing, haptic, cache, and audit closure

Scope:
- Continued the connected-orbit and disconnect-haptic packet, then bumped the app version for this new fix pass.
- Ran graph-first navigation first. The MCP graph was stale, so the repo-local Graphify artifact was regenerated and verified with `graphify query`.
- Used three independent audit lanes for functional bugs, responsive/performance, and final artifact/lint hygiene.

Implementation:
- Updated the visible app version and package metadata to `1.0.3`.
- Regenerated English and Japanese UI screenshot inventories and both demo PDFs so all generated artifacts now show version `1.0.3`.
- Lazy-rendered Settings avatar choices so the 48 profile animation frames are not inserted on the first screen.
- Added a peer-render signature guard so transfer progress does not rebuild static orbit peer DOM unnecessarily.
- Reduced the service-worker shell pre-cache to app shell assets only and moved animated avatars/PDFs to runtime caching.
- Made runtime caching deployment-scope aware for subpath installs and skipped Range requests/partial PDF responses.
- Increased narrow-mobile peer hit targets to 44 px while keeping the visual avatar size unchanged.
- Blocked peer reselection while verification/disconnect is in progress, cleared stale `pendingInviteId` after connection, and preserved the single connection pulse.
- Marked PDFs as binary for Git whitespace checks and ignored regenerated Graphify AST cache shards.
- Removed ignored local junk files (`.DS_Store` and Python `__pycache__`).

Verification:
- `npm run check` passed.
- `git diff --check` passed after adding PDF binary attributes.
- Direct syntax checks passed for `service-worker.js`, `js/core/controller.js`, `js/ui/app-view.js`, `scripts/capture-ui-elements.cjs`, and `scripts/generate-demo-pdfs.py`.
- PDF/inventory version checks confirmed `1.0.3` present and `1.0.2` absent in both PDFs and both screenshot inventories.
- Controller race harness confirmed selecting another peer during verification leaves `selectedPeerId` and `connectedPeerId` on the original peer, clears `pendingInviteId`, and fires one connection pulse.
- Service-worker VM probe confirmed runtime caching works at root and nested deployment scopes and skips PDF Range requests.
- Rendered mobile QA passed at 393x852, 430x932, 412x915, and 360x800:
  - 7 peers render on startup.
  - Settings avatar frames are not in the startup DOM.
  - Peer hit targets measure 44 px.
  - Connected ring gap spread stays under 0.02 px.
  - Connected cluster keeps visible inner-ring clearance.
  - Disconnect produces a 34 ms haptic fallback pulse, enters `disconnecting`, returns to `lobby`, and leaves the hidden switch unchecked.
- A persistent Pixel 8 pass reached connected mode with no console warnings or errors.

## 2026-06-15 Version 1.0.4 stronger connection haptics

Scope:
- Fixed the connect confirmation vibration after QA showed vibration was only noticeable on disconnect.
- Kept graph-first routing first; the MCP graph was stale, so the repo-local `graphify-out/graph.json` was used for haptic/controller navigation.

Implementation:
- Bumped the app/package/PDF source version to `1.0.4`.
- Increased connect and disconnect Vibration API feedback to a stronger 120 ms pulse.
- Fired the connect pulse immediately when the swipe-to-connect gesture completes, instead of relying only on the later async connection callback.
- Kept the async connected callback as a fallback, but suppressed duplicate buzzes immediately after a completed swipe.
- Stopped canceling the hidden native connect switch's completed pointerup, preserving the best-effort iOS native-switch haptic path.
- Regenerated English/Japanese screenshot inventories and both demo PDFs for version `1.0.4`.
- Bumped the service-worker cache to `webdrop-v2-static-21` / `webdrop-v2-runtime-21`.

Verification:
- Browser haptic probe at 393x852 confirmed connect pulses `[120]`, disconnect pulses `[120, 120]`, both hidden switches reset unchecked, connected mode is reached, disconnect returns to lobby, and console logs are clean.
# 2026-06-15 - Dynamic Island and QR production wiring

- Ported only the connection and QR scanner concepts from the standalone AI Island prototype; replay, pause, reverse, fake scan, and duplicate theme controls were intentionally excluded.
- Added a responsive, safe-area-aware Dynamic Island surface that follows the app theme, shows both connected identities with a restrained flow animation, and closes smoothly.
- Wired iPhone-to-iPhone QR verification to backend-issued, one-time pairing tokens using `BarcodeDetector` and explicit camera permission.
- Exposed sanitized platform capabilities through presence so the controller can choose QR only when both peers are iPhones.
- Fixed outgoing invite pairing to await acceptance before verification or WebRTC starts.
- Added a receiver-ready DataChannel barrier before file chunks, extended completion verification for real transfers, and clear completed receive state.
- Bound Cloudflare TURN credential requests to an ephemeral live signaling-session token and added configured-origin CORS handling.
- Incremented the app version to 1.0.5.

Final audit closure:
- Fixed camera permission races, repeated camera starts, stale island close timers, QR dialog focus/dismissal, Japanese accessibility labels, safe-area emergence, short-landscape sizing, and toast stacking.
- Added invalid QR retry instead of freezing after the first decoded code.
- Required server confirmation before the accepting peer advances into QR or WebRTC.
- Resolved verification waiters on peer disconnect, route failure, and signaling loss.
- Added WebSocket reconnect with exponential backoff and a conservative UI reset when signaling disappears.
- Required `ALLOWED_ORIGINS` in production and kept TURN access bound to an ephemeral live signaling session.
- Refreshed active pairing TTL from WebSocket pong, notified only the disconnected peer's partner, and added regression tests.
- Locked transfer state during hashing/preparation, consumed cancellation, moved completion timeout to the acknowledgement phase, and cleaned failed/canceled protocol entries.

Final verification:
- Root checks passed with 10/10 tests.
- AWS server checks passed with 23/23 tests.
- Responsive rendered QA passed at 393x852, 430x932, 412x915, 852x393 landscape, and 1280x900.
- QR accessibility, inert background, close/reopen timing, safe-area geometry, connect/disconnect transitions, and horizontal overflow checks passed.
- The provided Cloudflare identifier returned HTTP 404 as a TURN Key ID. The ignored local `.env` retains the demo values, but relay mode needs a valid Cloudflare TURN Key ID before deployment.

## 2026-06-15 Production readiness final audit lane 6 docs/handoff

Scope:
- Followed graph-first navigation before direct reads. The MCP graph and repo-local graph references were stale or unrelated for this checkout, so reads stayed scoped to owned docs, the AWS README, and directly connected runtime/backend files needed to verify claims.
- Owned docs lane files only: `docs/*.md`, `agenthistory.md`, `aws cloud server/README.md`, and `.workflow/production-readiness-final-audit/results/docs-handoff.md`.

Documentation fixes:
- Aligned docs with app/package/service-worker version `1.0.7`.
- Removed stale claims that QR UI, WebRTC negotiation, transfer protocol, and receive storage are only future-only work.
- Clarified the production boundary: the default app remains mock/disabled, while production WSS, QR, proximity, transfer, storage, and TURN paths are implemented behind runtime/deployment gates.
- Clarified backend responsibility: WebSocket carries metadata only; file bytes stay on WebRTC `RTCDataChannel`; long-lived Cloudflare TURN credentials stay server-side.
- Added remaining production activation work: EC2 deployment, rotated valid TURN credentials, real WSS/TURN URLs, physical-device calibration, direct/TURN transfer proof, load testing, and shared state before horizontal scaling.

Evidence:
- `package.json`, `index.html`, and `service-worker.js` report version `1.0.7`.
- `js/config/runtime-flags.js` keeps dependent production features ineffective unless production signaling has a valid URL.
- `js/services/webrtc-transport.js`, `js/services/data-channel-transfer-protocol.js`, and `workers/storage-worker.js` contain disabled-gated production transfer/storage implementation.
- `aws cloud server/src/signaling-hub.js` and tests cover binary rejection, QR issue/verify, proximity enforcement gates, TURN access tokens, and routed metadata messages.
- Verification commands passed: root `npm run check`, root `npm test` with 25 tests, AWS backend `npm run check`, AWS backend `npm test` with 26 tests, and docs-lane `git diff --check`.

## 2026-06-15 Version 1.0.7 production readiness closure

Scope:
- Coordinated eight audit lanes covering HTML/accessibility, CSS/responsiveness, app UI JavaScript, transfer/storage, AWS signaling, documentation, security/tests, and rendered browser QA.
- Rebuilt the repository Graphify artifacts after one audit lane left temporary-folder paths in the manifest.

Implementation:
- Added keyboard-safe bottom sheets with focus capture/restoration, Tab trapping, and Escape dismissal.
- Added localized production chat delivery failure handling.
- Aligned package, visible UI, service worker caches, screenshot catalogs, and both demo PDFs at version `1.0.7`.
- Loaded Japanese UI text with Source Han Sans JP Normal.
- Hardened DataChannel framing, worker storage ownership, signaling origin policy, TURN authorization, proximity reporting, and backend operational guidance.
- Removed ignored `.DS_Store` files, obsolete generated topbar screenshots, and stale reference files.

Verification:
- Root `npm run verify`: 25/25 tests passed.
- AWS server checks: 26/26 tests passed.
- English and Japanese PDFs: 23 pages each, version `1.0.7`; screenshot inventories: 29 PNGs each.
- Rendered Chrome QA passed at 360, 393, 412, 430, and 1280 px with no overflow or console errors.
- Dynamic Island verification visibly completed before the connected Venn merge.
- Settings focus trapping, Escape dismissal, and focus restoration passed.
- `git diff --check` and secret audits passed.

Production boundary:
- The implementation is deployment-ready but production paths remain gated until EC2, DNS/TLS, WSS/API URLs, and server-side TURN credentials are configured.
- Physical-device proximity calibration, two-device direct/TURN transfer proof, staged 10,000-client load testing, monitoring, and shared state for horizontal scaling remain deployment work.

## 2026-06-15 Version 1.0.8 service-worker deployment refresh

Diagnosis:
- GitHub received commit `3917638` at 21:32:39 JST and Vercel reported a successful deployment at 21:33:08 JST.
- The live Vercel `index.html` and `service-worker.js` matched the pushed files byte-for-byte, so the deployment itself was healthy.
- Existing tabs could still display the previous release because the service worker used cache-first navigation and waited for all old tabs to close before activating an update.

Fix:
- Changed page navigations to network-first with the cached shell retained only as an offline fallback.
- Added `skipWaiting()` and `clients.claim()` so a newly installed worker activates and controls open pages promptly.
- Added an app-side `controllerchange` reload and an explicit registration update check.
- Added regression coverage for the complete update lifecycle and bumped the app to `1.0.8`.

## 2026-06-15 Version 1.0.9 orbit and Dynamic Island polish

Scope:
- Removed both CSS-added white rings from orbit peer avatars while retaining the avatar artwork and accessible 44px hit targets.
- Changed the Dynamic Island close transition to shrink back into its compact pill before fading, avoiding the previous abrupt disappearance.
- Added a localized App Information switch that opens the real QR scanner UI as a permission-safe testing preview.

Implementation:
- Orbit peers now use transparent buttons and a subtle image drop shadow without pseudo-element rings.
- Dynamic Island close timing now uses a coordinated 580ms geometry transition followed by a short delayed fade.
- QR preview mode uses the existing scanner component, never starts the camera automatically, and returns to App Information when canceled.
- Added English and Japanese strings, controller wiring, responsive switch styling, and regression coverage.
- Incremented the app/package/service-worker/docs version to `1.0.9`.

Rendered evidence:
- Mobile QA at 393x852 confirmed orbit peers render without duplicate rings.
- App Information shows the QR scanner preview switch and the preview opens without requesting camera permission.
- Closing geometry reduced continuously from the expanded island to its compact pill before opacity reached zero.
- Browser console remained clear.

## 2026-06-15 Version 1.0.10 ring, QR, and island close polish

Scope:
- Restored one clean white ring on orbit peer avatars after the 1.0.9 duplicate-ring removal went too far.
- Kept dark-mode nearby candidate and friend-strip avatar circles white so the avatars remain readable.
- Removed the QR scanner's visible sound/motion fallback action and fallback copy from the Dynamic Island.
- Prevented the final closing frame from showing the island pill/cancel sliver.

Implementation:
- Moved the peer ring to `.peer-node img` and `.peer-node .avatar-animation`, leaving the 44px transparent tap target unringed.
- Forced peer-sheet candidate, friend, and plus circles to white backgrounds/borders in both themes.
- Made the QR scanner title nowrap with ellipsis protection and removed the fallback button from the app shell.
- Hid the Dynamic Island pill and cancel control during closing and faded the island earlier while it shrinks.
- Incremented the app/package/service-worker/docs/generated-output version to `1.0.10`.

Subagent audit:
- CSS visual audit recommended avatar-level ring restoration, white sheet circles, and early pill/cancel hiding.
- JS island/QR audit recommended removing the sound/motion scanner path, keeping the QR title one line, and adding close-state guards.
- Release QA audit identified the 1.0.10 version, screenshots/PDF, and final verification checklist.

Rendered evidence:
- Mobile QA at 393x852 confirmed peer avatar border `3px rgb(255, 255, 255)`, no `.peer-node button::before`, and zero horizontal overflow.
- Dark-mode nearby candidate sheet confirmed candidate, friend, and plus circles all render with white backgrounds and borders.
- QR scanner preview confirmed the title is one line, the fallback element/text is absent, and only Start camera is shown.
- Dynamic Island close samples confirmed pill and cancel opacity are zero during the closing shrink.

## 2026-06-16 Version 1.0.16 official device icon and cache polish

Scope:
- Fixed nearby-device brand badges that could look generic, faint, or non-official in the nearby sheet.
- Restored the connected-before badge to its own row below the distance and match badges.
- Checked whether stale service-worker caches could preserve old icon rendering.
- Ran three subagent lanes for UI/logo, cache/version, and cleanup/performance/animation review.

Implementation:
- Tightened device brand classification for Apple/iPhone/iPad/Mac/Watch, Samsung/Galaxy, Google/Pixel, Android/tablet/fold, and Windows/Surface.
- Made Samsung render as a readable official wordmark-style pill while keeping Apple, Google, Android, and Windows as official brand glyph badges.
- Improved dark-mode badge contrast so brand marks remain visible.
- Incremented package, lockfile, visible Settings version, service-worker cache version, docs, and screenshot/PDF scripts to `1.0.16`.
- Added a verification guard so `index.html` visible version must match `package.json`.
- Paused Dynamic Island flow and scan animations when the in-app motion setting is paused.
- Removed stale workflow/test-result artifacts and rebuilt `graphify-out`.

Verification:
- `npm run verify:full` passed.
- Workflow verification passed for `.workflow/webdrop-official-device-icon-cache-polish`.
- In-app Browser confirmed app identity, meaningful content, visible `1.0.16`, and no console warnings/errors.
- Temporary mobile Playwright smoke at 390x844 confirmed light/dark nearby sheets, zero horizontal overflow, readable Samsung wordmark badge, Apple/Google official badge classes, and history below the match row.

## 2026-06-17 Version 1.0.20 admin route and live testing dashboard

Scope:
- Added a standalone `/admin/` route for production readiness review and live testing.
- Kept the main app UI untouched while adding a separate admin surface for status, blockers, signaling, ICE, server probes, and transfer manifest simulation.
- Made the AWS signaling health route browser-testable from the static app domain.

Implementation:
- Created `admin/index.html`, `css/admin.css`, and `js/admin.js`.
- Added readiness cards for completed frontend, signaling, TURN, WebRTC, storage, proximity, and production-proof work.
- Added blocker cards for AWS deployment, TURN configuration, production URLs, proximity calibration, real transfer proof, load testing, real tests, and horizontal scale.
- Added WebSocket live monitor for the real `client:hello` schema, peer list tracking, ping/disconnect controls, and session facts.
- Added API probes for `/healthz`, `/api/ice-servers`, and `/api/metrics-summary`.
- Added ICE candidate gathering and DataChannel file-manifest simulation with 64 KiB chunk accounting.
- Redacted temporary TURN credentials from event logs while keeping the active session token visible in its dedicated test field.
- Added CORS headers to `/healthz` and related operational API errors so the admin route can test the backend from another origin.
- Incremented package, lockfile, visible Settings version, service-worker cache version, docs, and screenshot/PDF scripts to `1.0.20`.

Verification:
- `npm run verify:full` passed.
- In-app Browser confirmed `/admin/` renders eight readiness cards, eight blockers, and no horizontal overflow.
- In-app Browser confirmed the Live testing tab exposes WebSocket, API, ICE, and transfer tools.
- Local AWS signaling server smoke confirmed admin WebSocket connection, session id display, token redaction in logs, `/healthz` 200, and `/api/ice-servers` 200 with fallback STUN payload.
- Mobile-width Browser smoke at 390px confirmed no horizontal overflow and visible admin tabs.

## 2026-06-17 Version 1.0.23 Siri wave and admin visual alignment

Scope:
- Replaced the Dynamic Island connection bars with the `siriWaveCore` WebGL wave from `/Users/mfuad16/Documents/animations/siri-wave.html`.
- Restyled the `/admin/` page so it matches the WebDrop app theme more closely.
- Removed the opaque black WebGL canvas background from the Siri wave animation.

Implementation:
- Added `js/ui/siri-wave.js` with the copied Siri wave vertex/fragment shader and a small render wrapper.
- Mounted the wave in the existing Dynamic Island flow canvas without changing the connection or QR state machine.
- Switched the WebGL context to an alpha-enabled transparent surface and made the shader output alpha only where the wave emits light.
- Runs the wave only while the island is connecting or connected, and stops it for closed, QR, reduced-motion, and paused-motion states.
- Reworked `css/admin.css` around the WebDrop palette, grid background, glass panels, orbit hint, pill tabs, rounded sheets, and softer status rows.
- Added the new wave module to the service-worker asset list.
- Incremented package, lockfile, visible Settings version, service-worker cache version, docs, and screenshot/PDF scripts to `1.0.23`.

Verification:
- `npm run verify:full` passed.
- In-app Browser confirmed the main app loads with the new `[data-island-wave]` canvas, the real swipe-to-connect flow opens the Dynamic Island in `connecting`, and the app settles into connected mode with no horizontal overflow.
- In-app Browser confirmed `/admin/` renders with WebDrop-style background, glass hero, blue active tab, version `1.0.23`, eight readiness cards, eight blockers, and no console warnings/errors.
- Mobile-width Browser smoke at 390px confirmed the redesigned admin route has no horizontal overflow and keeps the tab controls visible.
- Browser screenshot capture timed out in the current Codex browser session, so visual evidence is from rendered DOM/computed-style checks rather than an attached screenshot.

## 2026-06-17 Version 1.0.26 streaming receive storage

Scope:
- Replaced the active receive storage path from Blob-only assembly to a streaming-download-first ladder.
- Kept WebRTC/DataChannel transfer framing unchanged.
- Preserved the 500 MB send and receive session caps while adding a lower memory-safety cap for Blob fallback when streaming is unavailable.

Implementation:
- Added `js/vendor/streamsaver-adapter.js`, a small ES module wrapper around the self-hosted StreamSaver MITM/service-worker protocol.
- Added `vendor/streamsaver/mitm.html`, `vendor/streamsaver/sw.js`, and `vendor/streamsaver/LICENSE`.
- Reworked `js/storage/storage-client.js` into a pluggable ladder: StreamSaver `WritableStream` first, Blob fallback second, and early rejection for oversized fallback-only receives.
- Updated receive-sheet behavior so streamed files show saved status while Blob fallback files keep the Open/object URL behavior.
- Updated English/Japanese app copy, admin readiness text, architecture docs, engineer guide, implementation checklist, and the expanded complete guide.
- Added `tests/storage-client.test.mjs` and made `npm test` run real storage regression tests.
- Enhanced `aws cloud server/scripts/smoke-test.sh` to run from its own server folder and verify invite pairing plus bidirectional chat routing.
- Incremented package, lockfile, visible app/cache/docs versions to `1.0.26`.

Verification:
- `npm test` passed with 3 storage-client tests: stream writer close, Blob fallback, and large fallback rejection.
- `npm run verify:full` passed.
- Live AWS smoke passed against `https://webdrop-wss-0617.japaneast.cloudapp.azure.com`: health, proximity policy, WSS connect, TURN credential proxy, invite pairing, and bidirectional chat.
- In-app Browser confirmed the local app loads at `http://127.0.0.1:4184/?qa=streaming-receive-module-v1026`, app info shows streamed downloads with Blob fallback, receive sheet exists, and empty receive state renders.
- The in-app Browser screenshot call timed out, and standalone Playwright is not installed in this repo; physical browser download behavior still needs Chrome/Edge/Safari device testing.

## 2026-06-17 Version 1.0.27 transfer, relay, and production render audit

Scope:
- Audited the completed static app, streaming receive path, live WebSocket signaling server, Cloudflare TURN proxy, and forced-relay WebRTC/DataChannel transfer path.
- Fixed the deployed production crash where WebSocket peers without local avatar/text fields caused `escapeHtml(undefined)` to throw during orbit and nearby-sheet rendering.

Implementation:
- Hardened `escapeHtml`, static avatar rendering, and animated avatar rendering so production presence messages can omit avatar/name fields without breaking the UI.
- Added Playwright e2e coverage for desktop, iPhone 15 Pro emulation, Pixel emulation, StreamSaver capability, and the nullish avatar/text regression.
- Added a live relay Playwright test that obtains TURN credentials through the deployed WSS backend and forces relay-only bidirectional DataChannel byte transfer.
- Serialized Playwright workers for this static server so cross-device checks are repeatable.
- Incremented package, lockfile, visible app/admin/cache/docs versions to `1.0.27`.

Verification:
- `npm run verify:full` passed.
- `npx playwright test tests/e2e/app-ui.spec.mjs --reporter=line` passed: 9 tests across desktop, iPhone 15 Pro emulation, and Pixel emulation.
- `npm run test:relay -- --reporter=line` passed with live TURN credentials, relay-only ICE, and bidirectional DataChannel payloads.
- Live AWS smoke passed against `https://webdrop-wss-0617.japaneast.cloudapp.azure.com`: health, proximity policy, WSS connect, TURN credential proxy, invite pairing, and bidirectional chat.

## 2026-06-18 Version 1.0.31 signaling resilience and full regression pass

Scope:
- Repaired a responder-side WebRTC race that could replace the active peer connection and emit an empty answer SDP.
- Added a deterministic signaling handshake deadline and honest offline UI for unreachable production endpoints.
- Aligned admin/readiness documentation with the implemented test suites, active 256 KiB transfer protocol, and streaming-download receive path.

Implementation:
- Made `WebRtcTransport` peer-connection creation single-flight and kept offer/answer/candidate handling on one stable connection instance.
- Capped Cloudflare TURN `customIdentifier` values at the documented 64-character service limit.
- Added an 8-second WebSocket handshake timeout with exponential reconnect behavior and explicit `connecting`, `online`, and `offline` app state.
- Added English and Japanese unavailable-service copy; stale peers are cleared when signaling is offline.
- Added a quiet Node static server for Playwright and made the e2e environment own both frontend and local Azure signaling processes.
- Updated admin blockers, Azure server documentation, activation guidance, package/cache/query versions, and PDF-generation metadata to `1.0.31`.

Verification:
- `npm run verify:full` passed, including secret scans and zero frontend/backend dependency vulnerabilities.
- Frontend unit tests passed with storage, concurrent WebRTC responder, and WebSocket handshake deadline coverage.
- Azure backend tests passed with SDP schema and Cloudflare TURN provider coverage.
- Full Playwright matrix passed with 17 tests and 4 intentional project-scope skips, including local two-page signaling and simultaneous bidirectional multi-chunk transfer.
- In-app Browser verified the offline state and `/admin/` tab interaction. External Playwright screenshots verified centered desktop and 393x852 mobile offline layouts with no horizontal overflow.
- The configured Japan East hostname resolved, but TCP 443 and `/healthz` timed out during this pass. No authenticated Azure CLI session was available on this machine, so VM recovery remains external.

## 2026-06-18 Version 1.0.32 production server validation and recovery hardening

Scope:
- Separated the unreachable Azure VM from the health of the signaling, TURN, and WebRTC implementation.
- Exercised the ignored production server environment locally using the deployed Vercel origin and real Cloudflare TURN credentials.
- Added fail-fast production configuration checks and operator recovery tooling.

Implementation:
- Added `/readyz` with non-secret environment readiness metadata and nginx routing.
- Production startup now rejects empty or wildcard origins, disabled TURN authentication, missing TURN credentials when fallback is disabled, and placeholder metrics tokens.
- Hardened the smoke test to preserve HTTP error responses and optionally require a real `turn:` or `turns:` credential.
- Updated the local ignored server environment to the deployed Vercel origin, production mode, authenticated TURN, and no STUN-only fallback.
- Enhanced Azure start/stop scripts with CLI authentication checks, power-state reporting, readiness polling, and actionable Run Command diagnostics.
- Installed Azure CLI 2.87.0 on the operator Mac; account login is still required before the VM can be started.
- Corrected the complete guide, production activation guide, checklist, README, and PDF source copy to reflect the production-configured runtime and verified local networking stack.
- Added a matching `/readyz` probe to the admin console and a three-profile browser regression test confirming public readiness checks do not receive bearer credentials.

Verification:
- Production-mode local smoke passed for `/healthz`, `/readyz`, proximity policy, exact-origin WebSocket admission, authenticated Cloudflare TURN credentials, invite pairing, and bidirectional chat.
- The ICE response contained managed TURN credentials with fallback disabled.
- Playwright live signaling passed with two pages discovering only each other, accepting a connection, transferring 320 KiB and 384 KiB files simultaneously in opposite directions with 256 KiB chunks, and disconnecting cleanly.
- Playwright forced-relay proof passed with bidirectional DataChannel bytes and relay ICE candidate classification.
- Eight Azure backend tests passed, including four new production-environment validation cases.
- The complete browser matrix now passes 20 tests with 4 intentional project-scoped skips.
- The public Japan East VM remains unreachable on ports 22, 80, 443, and 8080. Azure CLI is installed but not authenticated, so public recovery still requires `az login`.

## 2026-06-18 Version 1.0.33 mobile WebKit and orbit geometry hardening

Scope:
- Extended browser coverage to the Safari/WebKit engine using an iPhone 15 Pro profile.
- Rechecked the orbit and Dynamic Island visually after the production-readiness pass.

Implementation:
- Added a maintained `webkit-iphone-15-pro` Playwright project.
- Enabled live signaling and forced Cloudflare TURN relay proofs once per supported browser engine.
- Replaced the twelve lobby orbit slots with staggered four-ring phases that prevent adjacent-ring avatar collisions.
- Added a geometry regression test for minimum peer clearance and exact ring centering.
- Changed the light Dynamic Island Siri wave from `screen` to `multiply` blending so the animation remains visible on the white surface; dark mode remains unchanged.

Verification:
- iPhone 15 Pro WebKit app UI suite passed with five applicable tests and one Chromium-only StreamSaver import skip.
- WebKit live signaling and forced relay tests passed, including bidirectional multi-chunk DataChannel files.
- Orbit geometry passed on desktop Chromium, iPhone Chromium, Pixel Chromium, and iPhone WebKit.
- The expanded complete Playwright matrix passed 31 tests with 5 intentional project-scoped skips and no failures.
- Settled light/dark WebKit screenshots showed clean orbit spacing and a visible Siri wave with no browser console errors.
- A native iOS Simulator run remains unavailable because Xcode has no installed iOS runtime and the machine has insufficient free disk for a safe runtime installation.

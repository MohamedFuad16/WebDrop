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

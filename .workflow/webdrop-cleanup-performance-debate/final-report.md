# Final Report: WebDrop cleanup performance debate

## Outcome
Completed a focused cleanup/performance pass without changing the product direction. The accepted fixes reduce unnecessary render work during transfers, avoid rebuilding static sheet content on every render, throttle Siri wave layout measurement, defer received-file downloads until the user taps Save, and bring version/chunk-size documentation back in sync with the current app.

## Accepted Results
- Rendering/performance review: transfer progress was patching global state on every 256 KiB chunk. The controller now coalesces transfer progress updates through `requestAnimationFrame` and cancels stale queued patches on completion, cancel, failure, disconnect, and send errors.
- Rendering/performance review: received-file and chat panels were being rebuilt on every app render. The app view now uses compact render signatures so those lists update only when their visible data changes.
- Rendering/performance review: the Siri wave canvas called `getBoundingClientRect()` every frame. Resize work now happens on dirty resize events, with a low-frequency fallback when `ResizeObserver` is unavailable.
- Code-structure review: docs still mixed older app versions and 64 KiB transfer language. Documentation now references version `1.0.34` and the current `256 KiB` DataChannel chunk target.
- QA/security review: fallback avatar/text rendering had already been hardened; the focused browser checks confirmed the undefined text regression does not reappear.
- Live transport review: concurrent responder startup and an incoming RTC offer could create two peer connections and replace the active instance. That race produced an empty answer SDP and a 30-second verification timeout. Peer-connection creation is now single-flight and signal handling keeps a stable connection reference.
- TURN review: Cloudflare rejects `customIdentifier` values longer than 64 characters. Browser-generated WebDrop client ids can exceed that length, so the server now sanitizes and caps the identifier at 64 characters with a regression test.
- Test infrastructure review: the Python static server occasionally reset an ES-module request during the full browser matrix. The Playwright environment now owns a quiet Node static server plus the local Azure signaling service.
- Signaling resilience review: a black-holed WSS endpoint could leave the interface in a misleading connecting state for the browser TCP timeout. The adapter now has a deterministic 8-second handshake deadline, reconnects with backoff, clears stale peers, and renders an explicit unavailable state.
- Production-readiness review: the server now validates production origins, TURN authentication, fallback policy, and metrics credentials before listening. A public `/readyz` endpoint exposes only non-secret readiness metadata, and the admin console can probe it without leaking an entered bearer token.
- Azure operations review: start/stop helpers now verify Azure CLI authentication and VM power state, and deployment/smoke scripts validate `/readyz`. The configured Japan East public endpoint remains externally unreachable until the Azure VM is authenticated and recovered.
- Mobile WebKit review: an iPhone 15 Pro WebKit project now covers the application UI, live two-peer signaling, simultaneous bidirectional files, chat, disconnect, and forced Cloudflare TURN relay.
- Orbit geometry review: two adjacent-ring slot pairs could overlap at 34-36px on a 393px viewport. The twelve-peer layout now uses staggered phases with at least 8px hit-target clearance and exact ring-center assertions across every browser project.
- Dynamic Island review: `mix-blend-mode: screen` washed the Siri wave into the light island surface. Light mode now uses a contrast-preserving blend while dark mode retains the original screen blend.
- Receive-storage review: desktop browsers previously selected StreamSaver during receipt, which could trigger the browser's download prompt before the user opened the receive sheet. Incoming chunks now go into deferred IndexedDB storage where available, iPhone/iPad keeps the capped Blob fallback, and StreamSaver is used only when the user explicitly saves a completed file.

## Rejected Results
- Full protocol redesign was rejected for this pass. The existing signaling, proximity, and transfer architecture was retained while confirmed races and test gaps were repaired.
- Removing the current test-mode proximity bypass was rejected for this pass because it would change active QA/demo behavior. It remains a production-readiness risk to gate explicitly before public launch.
- Large file/session-cap changes were rejected for this pass; the current 500 MB per direction session cap remains.

## Conflicts Resolved
- The live-signaling e2e test used shared device names, which could collide with stale live sessions. It now uses unique per-run device names and IDs, then verifies the nearby sheet against that exact peer.
- The live product test now proves simultaneous bidirectional transfers using 320 KiB and 384 KiB payloads, so both directions cross the 256 KiB chunk boundary. It verifies both receive badges, both filenames, and clean disconnect.
- The bidirectional UI proof deliberately disables service workers so it exercises the deterministic fallback path. Deferred IndexedDB storage, Blob fallback, and StreamSaver-on-Save export behavior are covered separately by unit and browser-import tests.

## Verification Evidence
- `npm run check && npm test`: passed.
- `npx playwright test tests/e2e/app-ui.spec.mjs --grep "admin readiness probe" --reporter=line`: passed, 3/3 across desktop, iPhone 15 Pro, and Pixel 8 profiles.
- `npx playwright test tests/e2e/app-ui.spec.mjs --project=webkit-iphone-15-pro --reporter=line`: passed, 5/5 applicable tests with the Chromium-only StreamSaver import intentionally skipped.
- `npx playwright test tests/e2e/live-signaling-ui.spec.mjs tests/e2e/live-relay.spec.mjs --project=webkit-iphone-15-pro --reporter=line`: passed, 2/2.
- `npx playwright test tests/e2e/app-ui.spec.mjs --grep "paused orbit peers" --reporter=line`: passed, 4/4 across desktop Chromium, mobile Chromium, Android Chromium, and iPhone WebKit.
- `npx playwright test tests/e2e/live-signaling-ui.spec.mjs --project=chromium-desktop --reporter=dot`: passed, 1/1.
- `npx playwright test tests/e2e/app-ui.spec.mjs --grep "deferred Blob" --reporter=line`: passed, 1/1 applicable WebKit case with project-scoped skips elsewhere.
- `npx playwright test tests/e2e/app-ui.spec.mjs --grep "defers desktop" --project=chromium-desktop --reporter=line`: passed, 1/1.
- `npm run test:e2e -- --reporter=dot`: passed, 31 passed and 5 intentionally project-scoped skips.
- `npm run verify:full`: passed, including frontend checks/tests, secret audit, dependency audit, Azure cloud server syntax/test/audit, and `git diff --check`.
- The live-signaling trace confirms authenticated Cloudflare TURN credentials, offer/answer exchange, relay candidates, DataChannel establishment, and bidirectional multi-chunk file delivery.
- Rendered desktop and 393x852 mobile checks confirm the settings interface has no overflow and reports version 1.0.34. The `/admin/` route now exposes separate health and readiness probes.

## Remaining Risks
- Real physical-device validation is still required for iOS Safari, Android Chrome, haptics, and browser download behavior. Playwright cannot fully prove those OS-level flows.
- Xcode 27 beta is installed, but no iOS Simulator runtime is present and only about 5.2 GiB is free, so installing a full runtime was intentionally avoided to prevent disk exhaustion.
- The live relay/TURN tests prove the tested paths under automation, but real NAT diversity and degraded mobile networks still require field testing.
- The configured Azure Japan East endpoint is currently unreachable from the public internet. Local production-mode signaling and Cloudflare TURN are proven, but hosted recovery requires an authenticated `az login` session before launch claims are valid.
- Production launch should disable or hard-gate proximity test bypasses and finish the audio chirp, QR, tilt, and bump verification paths.
- Backend coverage remains intentionally lightweight compared with the frontend; larger production deployment should add multi-client soak/load testing and stronger WebSocket/auth/rate-limit tests.

## Reusable Follow-up
- Add a throttled transfer-progress unit test around the controller once a controller test harness exists.
- Add a Siri wave animation micro-benchmark or repeated open/close visual test when the browser test budget allows.
- Convert the workflow result into a release checklist item before the next production-readiness pass.

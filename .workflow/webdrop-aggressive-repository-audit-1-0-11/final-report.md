# Final Report: WebDrop aggressive repository audit 1.0.11

## 1. Architecture summary
WebDrop is a static HTML/CSS/vanilla JavaScript app with a separate Node.js WebSocket signaling server under `aws cloud server/`.

- Frontend: `index.html` shell, CSS split by surface, vanilla JS state/controller/UI modules, workers for storage, and static assets/docs.
- Dynamic Island: `js/ui/dynamic-island.js` owns QR/connection/progress states. `js/ui/app-view.js` coordinates sheets, focus, inert background behavior, tray actions, haptics, locale/theme, and profile controls.
- Real time: frontend adapters support mock/local signaling and future WebSocket signaling. Backend `/ws` routes only metadata, invites, proximity telemetry, RTC signaling, chat, transfer manifests/control, and disconnects.
- WebRTC: file bytes are intended to move browser-to-browser over `RTCDataChannel`, with WebSocket reserved for coordination.
- Storage: worker-backed receive path chooses OPFS first, IndexedDB second, and memory only when appropriate.
- TURN: backend generates temporary Cloudflare TURN `iceServers` server-side; long-term credentials stay out of browser code.
- Tests: root Node test suite covers frontend state/protocol contracts; AWS Node test suite covers HTTP, WebSocket, TURN, QR/proximity, schemas, and signaling behavior.

See `architecture-map.md` in this workflow folder for the graph and module map.

## 2. Commands executed
- `graphify query "Dynamic Island AppView tests workflow WebDrop architecture" --limit 12`
- `git status --short --branch`
- `node --check js/ui/app-view.js js/ui/dynamic-island.js aws cloud server/src/signaling-hub.js aws cloud server/src/message-schema.js workers/storage-worker.js`
- `npm test`
- `npm run check`
- `npm --prefix "aws cloud server" run check`
- `npm --prefix "aws cloud server" test`
- `npm run verify`
- `npm run verify:full`
- `rg -n "\.only\(|\.skip\(|test\.skip|describe\.skip|it\.skip" test "aws cloud server/test" || true`
- `python3 -m py_compile scripts/generate-demo-pdfs.py scripts/build-avatar-frames.py`
- `curl -I --max-time 3 http://127.0.0.1:4178/`
- Browser QA through the in-app browser at `http://127.0.0.1:4178/`

## 3. Problems discovered
| Severity | Area | Reproduction | Root cause | Fix applied | Regression coverage |
|---|---|---|---|---|---|
| High | Dynamic Island accessibility | Open QR preview, close it, inspect focus during closing. | Island entered `closing` visually but retained focusable active content. | `js/ui/dynamic-island.js` now treats `closing` as hidden/inert and blurs focus inside the island before collapse. | `test/production-readiness.test.js`; browser close QA. |
| High | Bottom sheet accessibility | Open a sheet and Tab/Shift+Tab around controls. | Background was not consistently inert and focus trap did not recover when focus escaped sheet. | `js/ui/app-view.js` now inerts topbar/stage/tray/island while sheets are open and improves focus trapping/restoration. | `test/production-readiness.test.js`. |
| Medium | Send swipe control | Open send sheet before selecting a file and keyboard/touch activate the swipe thumb. | Disabled visual state did not remove the thumb from keyboard/action path. | Added `setSendSwipeReady()`, disabled thumb handling, and disabled swipe guards. | `test/production-readiness.test.js`. |
| Medium | Invalid HTML semantics | Static validation of `index.html`. | Bare `switch` attributes were invalid and avatar picker used listbox semantics without arrow-key behavior. | Replaced bare attributes with `role="switch"` and converted avatar picker to a button group with `aria-pressed`. | `test/production-readiness.test.js`. |
| Medium | Connected ring spacing | Connect peers on mobile and inspect innermost orbit against Venn avatars. | Connected-mode inner orbit diameter was too small for the two-avatar cluster. | Increased connected inner ring sizing in `css/orbit.css`. | `test/production-readiness.test.js`; browser connected-state measurement. |
| High | WebSocket client ID takeover | Connect same client id twice to AWS signaling. | New socket replaced the live client. | Duplicate live IDs now receive `client_id_in_use` and close without evicting the original. | `aws cloud server/test/signaling.test.js`. |
| High | Spoofed invite rejection | Third client sends reject for another pair. | Invalid reject could delete pending invite state. | Reject now verifies pending direction/expiry before mutation. | `aws cloud server/test/signaling.test.js`. |
| High | QR proximity gate | Try QR verification before accepted invite. | QR verification trusted pending pair too early. | QR token verification now requires an accepted active pair. | `aws cloud server/test/signaling.test.js`. |
| Medium | Unknown WebSocket upgrades | Upgrade a non-`/ws` path. | Server did not explicitly reject unknown upgrade paths. | Unknown upgrades now receive 404 and socket close. | `aws cloud server/test/signaling.test.js`. |
| Medium | Oversized RTC fields | Send oversized SDP/candidate. | Schema truncated strings instead of rejecting invalid control messages. | Oversized SDP/candidate now fail validation. | `aws cloud server/test/message-schema.test.js`. |
| Medium | Oversized transfer manifests | Send transfer manifest above intended control-plane limits. | Manifest schema lacked total/chunk/file ceilings. | Added total bytes, chunk size, and chunk count bounds. | `aws cloud server/test/message-schema.test.js`. |
| Medium | TURN fail-open | Disable STUN fallback without Cloudflare env. | TURN provider still returned fallback STUN. | Provider now fails closed when fallback is disabled and credentials are missing. | `aws cloud server/test/turn-provider.test.js`. |
| Medium | OPFS fallback corruption | Simulate OPFS failure after chunks are written. | Worker could delete OPFS and switch backend mid-transfer. | Worker now rejects unsafe fallback once bytes/chunks exist. | `test/production-readiness.test.js`. |
| Medium | Transfer cancellation | Abort while sender waits for receiver readiness/backpressure. | Promise waiters ignored AbortSignal. | Transfer protocol now rejects readiness/backpressure waits on abort. | `test/production-readiness.test.js`. |
| Low | Incoming transfer cleanup | Complete receive flow and inspect internal state. | Completed incoming sessions remained in memory. | Receiver deletes incoming state after completion. | `test/production-readiness.test.js`. |
| Medium | WebRTC terminal failure | Peer connection hits failed/closed before timeout. | Controller waited for timeout instead of terminal failure. | `waitForTransportConnection()` rejects immediately on failed/closed state. | `test/connection-choreography.test.js`. |
| Low | Release gate coverage | Run root release script. | Root script did not include AWS checks/audits. | Added `npm run verify:full` to cover root, AWS, audits, and diff whitespace. | `test/production-readiness.test.js`. |

## 4. Dynamic Island device matrix
Browser QA was run through the in-app browser. These are emulated viewport/DPR checks, not physical Safari proof.

| Device profile | Viewport | DPR | Safe-area strategy | Closed | Opening/Open | Closing | Orientation | Evidence |
|---|---:|---:|---|---|---|---|---|---|
| iPhone 15 Pro | 393 x 852 | 3 | Centered fixed island with CSS variables and viewport constraints | `state=closed`, `aria-hidden=true`, `pointer-events=none`, center delta `0`, no overflow | QR open `state=qr-scan`, active focus inside, width `364`, title nowrap, center delta `0` | Closed again, focus outside, center delta `0` | Portrait pass | Browser matrix result, log count `0` |
| iPhone 15 Pro Max | 430 x 932 | 3 | Same | Closed center delta `0`, four rings, no overflow | QR open width `410`, center delta `0`, title nowrap | Closed again, focus outside | Portrait pass | Browser matrix result, log count `0` |
| Small iPhone fallback | 375 x 812 | 3 | Same | Closed center delta `0`, four rings, no overflow | QR open width `355`, center delta `0`, title nowrap | Closed again, focus outside | Portrait pass | Browser matrix result, log count `0` |
| Landscape fallback | 852 x 393 | 3 | Same with width/height clamping | Closed center delta `0`, four rings, no overflow | QR open width `828`, center delta `0`, title nowrap | Closed again, focus outside | Landscape fallback pass | Browser matrix result, log count `0` |

Additional focused check:
- QR preview open: `activeInside=true`, `aria-hidden=false`, `pointer-events=auto`, title `Scan the nearby iPhone`.
- 80 ms into close: `state=closing`, `aria-hidden=true`, `pointer-events=none`, `activeInside=false`, center delta `0`.
- Fully closed: `state=closed`, `aria-hidden=true`, `pointer-events=none`, `activeInside=false`, center delta `0`.

## 5. Test results
- Root tests: 33 passed, 0 failed, 0 skipped.
- AWS tests: 32 passed, 0 failed, 0 skipped.
- Root `npm run verify:full`: passed.
- Root `npm audit --omit=dev`: 0 vulnerabilities.
- AWS `npm audit --omit=dev`: 0 vulnerabilities.
- Secret audit: passed.
- Focused/skipped test scan: no `.only`/`.skip` matches in root or AWS tests.
- Python script compile: passed for demo PDF and avatar frame scripts.
- Browser QA: passed on four viewport profiles with zero captured warnings/errors during the measured interactions.

New regression tests were added for:
- Dynamic Island/sheet focus contracts.
- Avatar picker semantics.
- Connected ring spacing and QR preview affordance.
- WebRTC terminal failure handling.
- Transfer abort/cleanup and unsafe OPFS fallback.
- WebSocket duplicate IDs, spoofed rejects, QR pre-accept rejection, unknown upgrade rejection.
- RTC/control message size validation.
- TURN fail-closed behavior.

## 6. Performance results
- Dynamic Island close/open uses centered geometry and compositor-friendly CSS transitions already present in the app.
- Browser matrix found no horizontal overflow and no console warnings/errors across tested mobile viewports.
- No long-running memory/FPS probe or Lighthouse trace was added in this pass because the repository does not currently include a Lighthouse/visual-regression harness, and adding a new heavyweight stack would be larger than the confirmed fixes.
- Remaining recommendation: add CI-backed Playwright trace/video capture plus Lighthouse once the project standardizes a browser test runner.

## 7. Security findings
Fixed:
- Duplicate client ID takeover in signaling.
- Spoofed invite rejection state deletion.
- QR verification before accepted pairing.
- Unknown WebSocket upgrade handling.
- Oversized RTC/control field truncation.
- Oversized transfer manifest acceptance.
- TURN fail-open when fallback is intentionally disabled.
- Root release gate missing AWS checks.

Still recommended:
- Bind production client IDs to authenticated sessions instead of trusting client-provided IDs.
- Harden IP/rate-limit identity behind trusted proxy configuration.
- Add periodic cleanup for HTTP rate-limit buckets.
- Add origin/env policy checks to deployment CI.
- Treat proximity telemetry as report-only until server-side challenge/signing and physical-sensor calibration are complete.
- Validate on real iPhones for camera/mic/motion permission prompts and physical Dynamic Island safe-area behavior.

## 8. Remaining limitations
- Physical iPhone Dynamic Island concealment, Safari browser chrome collapse, standalone PWA safe areas, and real camera/mic/motion permission behavior still require device testing.
- WebRTC/TURN live negotiation was not tested against deployed AWS + Cloudflare TURN in this pass.
- Full 100-cycle animation memory/FPS profiling and Lighthouse were not integrated because no repo-native harness exists yet.
- Some subagent recommendations were intentionally deferred because they are production-hardening work rather than directly reproducible local bugs: trusted proxy/IP policy, rate bucket sweeping, deployment ownership model, and proximity anti-spoof design.

## Outcome
Accepted and integrated fixes touched the expected frontend UI/accessibility/animation paths, transfer/storage/WebRTC paths, AWS signaling/TURN/schema paths, and regression tests. The app version is now `1.0.11`.

## Verification Evidence
`npm run verify:full` passed end-to-end, and browser QA verified the Dynamic Island close/open behavior across the compact device matrix.

## Reusable Follow-up
1. Add a Playwright project with screenshot/video baselines for Dynamic Island checkpoints.
2. Add Lighthouse/trace CI once the browser harness is stable.
3. Run the AWS server on EC2 with real Cloudflare TURN credentials and test end-to-end WebRTC negotiation.
4. Test proximity on physical iPhones and Android devices before enabling enforcement.

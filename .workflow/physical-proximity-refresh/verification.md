# Physical Proximity Refresh Verification

## Completed

- `npm run check` passed.
- `npm test` passed: 18 tests.
- `npm --prefix "azure cloud server" run check` passed.
- `npm --prefix "azure cloud server" test` passed: 21 tests.
- `npm run test:e2e` passed on `1.0.54`: 53 passed, 47 expected project skips.
- `npm run verify:full` passed, including audits and `git diff --check`.
- Bidirectional acoustic regression proves both devices emit and detect the peer chirp over a timing-sensitive virtual audio link.
- Chromium Web Audio loopback passed: the sender emitted a 72ms chirp at 48kHz and a second `AcousticProximitySensor` detected it at 0.9988 correlation with 48.2dB band margin.
- Browser mobile smoke passed with Playwright WebKit at `http://127.0.0.1:4178/?qa=browser-qa&runtime=mock`: app ready, no horizontal overflow at iPhone 15 Pro width, mock proximity entered verification, the verified peer reveal showed `100 / 100`, Canvas2D Siri wave was nonblank, and console errors/warnings list was empty.
- In-app browser lightweight mobile smoke passed at the same local URL: app ready, no horizontal overflow at 390px, and console warnings/errors list was empty.
- Receive-open browser smoke passed with Playwright WebKit at `http://127.0.0.1:4178/?qa=webkit-receive-copy&runtime=mock`: connected state stayed active, the received demo PDF action rendered explicit `View` and `Download` buttons, `View` opened a separate tab, and console errors/warnings list was empty.
- Screenshot evidence saved to `.workflow/physical-proximity-refresh/browser-mobile-smoke.png`.
- Receive-view screenshot evidence saved to `.workflow/physical-proximity-refresh/browser-webkit-receive-view.png`.

## E2E Coverage Notes

- Live two-page proximity connects without peer selection and hides peer identity until `proximity:match`.
- Three-client server unit proves A+B match while C stays unmatched.
- Score below 55 remains in `verification-failed` for 50 seconds and QR sheet stays hidden until `Use QR`.
- Manual peerless QR show/scan connects after camera scan.
- WebKit iPhone Siri wave renders nonblank without WebGL.
- iPhone-style permission tests cover same-gesture motion, microphone, and QR camera warmup.
- WebKit iPhone received-file `View` calls `window.open(..., "_blank", "noopener,noreferrer")`, confirms the new tab, and leaves the WebDrop app tab connected.
- Previewable received files expose explicit `View` and `Download` actions; non-previewable files stay download-only.
- Acoustic replies wait for the shared slot boundary even when detection resolves early, preventing the reply from being hidden under the first device's transmit phase.
- WebKit iPhone geometry proves the island begins at viewport top, collapses toward the hardware capsule, stays black in light mode, clears a 59px safe area, and restores the normal browser theme color when closed.
- WebKit iPhone QR-display visual smoke passed at 393x852 with black island/browser chrome, top offset 0, no horizontal overflow, and no console warnings or errors.
- A 400x970 tall-viewport regression proves the connected dock sits 18px from the viewport bottom instead of being contained by the orbit scene; orbit peer paint containment is disabled so circular shadows are not clipped into rectangles.
- WebKit iPhone geometry proves the QR and receive sheets have zero-pixel left, right, and bottom gaps with top-only corner rounding.
- Branded QR regression decodes the rendered token after adding the WebDrop gradient frame and blue, teal, and violet finder colors.
- WebKit keyboard transfer activation passed five consecutive focused runs and the complete browser matrix after adding the synthetic-click fallback.
- Release `1.0.47` advances the service-worker cache key so iPhones cannot remain pinned to the pre-fix transfer handler.

## Notes

- The in-app browser screenshot API timed out and briefly caused selector/evaluate timeouts, so visual screenshot evidence was captured with Playwright WebKit against the same local URL and mobile viewport. A later lightweight in-app browser DOM/console check passed.
- During the acoustic follow-up, the in-app browser could not recover its localhost tab after an initial connection refusal, so the rendered Web Audio loopback used the repository's Playwright Chromium project.
- Follow-up testing found the mock/demo received PDFs had no `id` or `transferId`, so their visible action button could not resolve the item on click. The demo items now carry stable IDs, and a WebKit iPhone E2E regression covers the `Open` path.
- Full-matrix WebKit testing exposed an old `app-view.js` served from an unchanged service-worker cache after a late patch. The cache version now advances with the code fix.
- Mobile island geometry now measures zero-pixel left and right gaps, with the Canvas2D wave centered within 0.01px.
- All 12 mock peer centers measure zero-pixel radial error against the visible SVG circle paths.
- The simplified branded QR retains blue, teal, and violet finder colors and decodes successfully with `jsQR`.
- The default 72ms acoustic signature now sweeps from 20.2 to 21.2 kHz through a 19.5 kHz high-pass filter.
- Ten consecutive Chromium Web Audio loopback runs proved the inaudible-band signature was emitted and detected with more than 20dB spectral margin.
- 44.1 kHz contexts refuse emission instead of folding the signature below 20 kHz.
- Four-client sessions now use unique anonymous acoustic signatures and require reciprocal strongest-signature reports before matching.
- Two simultaneous pairs with nearly identical bump times stay correctly separated; crossed timing alone cannot pair them.
- Session telemetry with a nonce that does not match the join nonce is rejected.
- The four-participant join window remains open long enough to collect the room; a fifth participant rolls into a new session.
- A score above 55 is rejected when ultrasound, bump, or tilt evidence is missing.
- Telemetry outside the server-issued ceremony time window is rejected.
- A one-device session gets one short grace window so a slightly late partner does not trigger a false sync failure.
- Release `1.0.54` adds live acoustic slot diagnostics to the Dynamic Island: emitting/listening/detected/missed slot, emitted count, margin, and frequency band are now surfaced during the physical ceremony.
- `node --test tests/proximity-engine.test.mjs` passed after adding progress-event coverage for emitted and detected anonymous acoustic signature slots.
- `npx playwright test tests/e2e/app-ui.spec.mjs --project=chromium-desktop --grep 'acoustic slot diagnostics'` passed and proved the visible island text renders as `Detected 2/4 +31dB 20.4-20.6kHz`.
- Release `1.0.54` also keeps the final acoustic summary after completion/failure, including `Missed 2 slots 20.4-20.9kHz` for failed multi-slot detection.
- Release `1.0.54` replaces received-file `Open` with explicit `View`/`Download` actions and smooths the Dynamic Island transfer percentage/bar.
- Release `1.0.55` replaces the pre-match peer avatar with a neutral, image-free anonymous marker so no identity is implied before a verified physical match.
- `npm run verify:full` passed on `1.0.55`: 18 frontend/unit tests, 21 signaling-server tests, secret audits, package audits, and diff validation.
- `npm run test:e2e` passed on `1.0.55`: 53 passed and 47 expected project skips, including WebKit island geometry, new-tab receive viewing, live TURN relay, and live signaling.
- Release `1.0.56` allows anonymous proximity and Retry to enter a fresh server-managed session even when the visible peer list is empty.
- `npm run verify:full` and `npm run test:e2e` passed on `1.0.56`; the below-55 regression now proves Retry reopens an anonymous ceremony after the visible peer list reaches zero.
- Release `1.0.57` keeps Connect enabled whenever signaling is online, even with zero publicly visible peers, preserving the anonymous bump-first entry path.
- Release `1.0.57` also holds completed send progress at 100% for 1.2 seconds before retracting, preventing WebKit from skipping the completion animation.
- Final `1.0.57` gates passed: `npm run verify:full` and `npm run test:e2e` with 53 passed and 47 expected project skips.
- Focused checks passed: `npm run check`, `node --test tests/proximity-engine.test.mjs`, WebKit E2E for received-file new-tab behavior, WebKit transfer-progress E2E, and Chromium transfer-progress E2E.
- The failed island now exposes translated `Retry` and `Use QR instead` actions; the below-55 E2E keeps the island open for 50 seconds and proves QR remains hidden until explicitly tapped.
- Anonymous acoustic sessions now add a short late-listen grace pass after the scheduled slots; unit coverage proves a peer signature missed in the normal slot can still be detected before scoring fails.
- Release `1.0.58` adds `/admin/diagnostics.html`, a protected signaling snapshot endpoint, bounded connection-event history, live proximity/acoustic telemetry, and a local production-chirp microphone lab.
- `npm run verify:full` passed on `1.0.58`: 19 frontend/unit tests, 24 signaling-server tests, secret audits, package audits, and diff validation.
- `npm run test:e2e` passed on `1.0.58`: 54 passed and 50 expected project skips, including the diagnostics dashboard, Web Audio loopback, WebKit receive/new-tab behavior, live TURN relay, and live signaling.
- In-app browser QA passed at desktop and 393px mobile widths with no console errors or horizontal page overflow; the protected-endpoint error is inline and does not cover the acoustic controls.

## BumpBurst V2 Evidence

- Release `1.0.65` replaces per-slot microphone polling for anonymous sessions with one continuous ceremony capture and offline coded-signature decoding.
- Anonymous sessions now support up to six participants in one cohort and assign shared-band signature codes instead of consuming one fixed frequency band per device.
- Production chirps now use a strict inaudible 20.05-20.95 kHz, 96ms coded waveform; unsupported sample rates still refuse emission rather than falling below 20 kHz.
- Client telemetry now reports acoustic detections, confidence margin, runner-up correlation, sample offsets, sample rate, and permission status.
- Server matching now rejects ambiguous reciprocal reports when the strongest signature does not beat the runner-up by the configured margin.
- Five-client session coverage proves nearby bystanders can stay in the same cohort without forcing QR or a second session.
- In-app Browser mobile QA at `http://127.0.0.1:4178/?qa=bumpburst-v2&runtime=mock` passed after the `1.0.65` cache bump: app loaded at 393x852, Connect entered the Dynamic Island ceremony, visible score reached `100 / 100`, and console warnings/errors were empty.
- In-app Browser diagnostics QA at `http://127.0.0.1:4178/admin/diagnostics.html?qa=bumpburst-v2` passed layout/content checks and showed the updated continuous coded 20.05-20.95 kHz lab copy with no console errors. The local in-app host did not grant a real microphone stream, so physical airborne emission/receipt remains a real-device validation step.
- `npm run verify:full` passed on `1.0.65`: 21 frontend/unit tests, 25 signaling-server tests, secret audits, package audits, and `git diff --check`.
- `npm run test:e2e` passed on `1.0.65`: 72 passed, 56 expected project skips, including coded chirp browser loopback, live anonymous signaling, live TURN relay, WebKit iPhone permission checks, received-file new-tab behavior, Siri wave fallback, and edge-to-edge Dynamic Island geometry.

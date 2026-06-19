# Physical Proximity Refresh Verification

## Completed

- `npm run check` passed.
- `npm test` passed: 16 tests.
- `npm --prefix "azure cloud server" run check` passed.
- `npm --prefix "azure cloud server" test` passed: 21 tests.
- `npm run test:e2e` passed: 52 passed, 44 expected project skips.
- `npm run verify:full` passed, including audits and `git diff --check`.
- Bidirectional acoustic regression proves both devices emit and detect the peer chirp over a timing-sensitive virtual audio link.
- Chromium Web Audio loopback passed: the sender emitted a 72ms chirp at 48kHz and a second `AcousticProximitySensor` detected it at 0.9988 correlation with 48.2dB band margin.
- Browser mobile smoke passed with Playwright WebKit at `http://127.0.0.1:4178/?qa=browser-qa&runtime=mock`: app ready, no horizontal overflow at iPhone 15 Pro width, mock proximity entered verification, the verified peer reveal showed `100 / 100`, Canvas2D Siri wave was nonblank, and console errors/warnings list was empty.
- In-app browser lightweight mobile smoke passed at the same local URL: app ready, no horizontal overflow at 390px, and console warnings/errors list was empty.
- Receive-open browser smoke passed with Playwright WebKit at `http://127.0.0.1:4178/?qa=webkit-receive-copy&runtime=mock`: connected state stayed active, the received demo PDF action rendered as `Open`, opened a separate tab, and console errors/warnings list was empty.
- Screenshot evidence saved to `.workflow/physical-proximity-refresh/browser-mobile-smoke.png`.
- Receive-view screenshot evidence saved to `.workflow/physical-proximity-refresh/browser-webkit-receive-view.png`.

## E2E Coverage Notes

- Live two-page proximity connects without peer selection and hides peer identity until `proximity:match`.
- Three-client server unit proves A+B match while C stays unmatched.
- Score below 55 remains in `verification-failed` for 50 seconds and QR sheet stays hidden until `Use QR`.
- Manual peerless QR show/scan connects after camera scan.
- WebKit iPhone Siri wave renders nonblank without WebGL.
- iPhone-style permission tests cover same-gesture motion, microphone, and QR camera warmup.
- WebKit iPhone received-file `Open` calls `window.open(..., "_blank", "noopener,noreferrer")`, confirms the new tab, and leaves the WebDrop app tab connected.
- Desktop received-file behavior is explicitly labeled `Download`.
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

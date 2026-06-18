# Physical Proximity Refresh Verification

## Completed

- `npm run check` passed.
- `npm test` passed: 13 tests.
- `npm --prefix "azure cloud server" run check` passed.
- `npm --prefix "azure cloud server" test` passed: 14 tests.
- `npm run test:e2e` passed: 43 passed, 29 skipped.
- `npm run verify:full` passed, including audits and `git diff --check`.
- Browser mobile smoke passed with Playwright WebKit at `http://127.0.0.1:4178/?qa=browser-qa&runtime=mock`: app ready, no horizontal overflow at iPhone 15 Pro width, mock proximity entered verification, the verified peer reveal showed `100 / 100`, Canvas2D Siri wave was nonblank, and console errors/warnings list was empty.
- In-app browser lightweight mobile smoke passed at the same local URL: app ready, no horizontal overflow at 390px, and console warnings/errors list was empty.
- Receive-view browser smoke passed with Playwright WebKit at `http://127.0.0.1:4178/?qa=webkit-receive-copy&runtime=mock`: connected state stayed active, the received demo PDF action rendered as `View`, the action was on-screen, and console errors/warnings list was empty.
- Screenshot evidence saved to `.workflow/physical-proximity-refresh/browser-mobile-smoke.png`.
- Receive-view screenshot evidence saved to `.workflow/physical-proximity-refresh/browser-webkit-receive-view.png`.

## E2E Coverage Notes

- Live two-page proximity connects without peer selection and hides peer identity until `proximity:match`.
- Three-client server unit proves A+B match while C stays unmatched.
- Score below 55 remains in `verification-failed` for 50 seconds and QR sheet stays hidden until `Use QR`.
- Manual peerless QR show/scan connects after camera scan.
- WebKit iPhone Siri wave renders nonblank without WebGL.
- iPhone-style permission tests cover same-gesture motion, microphone, and QR camera warmup.
- WebKit iPhone received-file `View` calls `window.open(..., "_blank", "noopener,noreferrer")` and leaves the WebDrop app tab connected.
- Desktop received-file behavior remains download-first.

## Notes

- The in-app browser screenshot API timed out and briefly caused selector/evaluate timeouts, so visual screenshot evidence was captured with Playwright WebKit against the same local URL and mobile viewport. A later lightweight in-app browser DOM/console check passed.
- Follow-up testing found the mock/demo received PDFs had no `id` or `transferId`, so their visible action button could not resolve the item on click. The demo items now carry stable IDs, and a WebKit iPhone E2E regression covers the `View` path.

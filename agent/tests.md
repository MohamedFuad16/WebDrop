# Tests

## Strategy
Two layers, both runnable from the repo root:
1. **Unit tests** — Node's built-in test runner (`node --test`) over `tests/*.test.mjs`. These exercise pure/logic modules in isolation (no browser).
2. **End-to-end tests** — Playwright (`tests/e2e/*.spec.mjs`) drive the real UI in Chromium/WebKit, including live signaling/relay specs. Config: `playwright.config.mjs`. The backend has its own separate test suite under `azure cloud server/tests/`.

## How to run
```bash
npm test            # node --test tests/*.test.mjs   (unit)
npm run test:e2e    # playwright test                 (all e2e; needs `npx playwright install`)
npm run test:relay  # playwright test tests/e2e/live-relay.spec.mjs --project=chromium-desktop
npm run verify      # npm run check && npm test
npm run verify:full # verify + audit:secrets + npm audit + backend check/test/audit + git diff --check
```
Run `npm run serve` if a spec expects the app served at `http://127.0.0.1:4178`.

## Key existing tests
**Unit (`tests/`):**
- `proximity-engine.test.mjs` — scoring + ceremony gating.
- `admin-test-runs.test.mjs` — Pair A/B validation, correct vs cross-pair classification, event de-duplication, and failed-session capture.
- `webrtc-transport.test.mjs` — signal handling, channel setup, path classification.
- `websocket-signaling.test.mjs` — handshake, reconnect, event normalization.
- `storage-client.test.mjs` — backend selection, session lifecycle, caps.
- `received-files.test.mjs` — preview-safety logic.

**E2E (`tests/e2e/`):** `app-ui.spec.mjs` (orbit, sheets, settings, dynamic-island, also dynamically imports `siri-wave.js`), `diagnostics.spec.mjs` + `live-signaling-ui.spec.mjs` (admin dashboard; stubs policy/diagnostics and exercises the four tabs, Settings update, assignments, and test recording), `live-relay.spec.mjs` (real WebRTC relay path), `blank.html` (test harness).

**Backend (`azure cloud server/tests/`):** `runtime-proximity-policy.test.mjs` covers validation/revision/persistence; `server-config.test.mjs` covers authenticated PUT, invalid input, immediate application, and restart recovery; `signaling-hub.test.mjs` covers bounded cohorts, late partners, reciprocal matching, and diagnostics.

## Latest verification (2026-07-02)
- `npm run verify:full`: 52/52 frontend unit tests and 54/54 backend tests pass; frontend/backend audits report 0 vulnerabilities; secret and diff checks pass.
- WebKit iPhone permission E2E: the motion and microphone requests both start from one user gesture, and the microphone receives the intended raw-audio constraints.
- `npx playwright test tests/e2e/diagnostics.spec.mjs --project=chromium-desktop`: 5/5 admin E2E tests pass.
- Production QA (`/admin/?tab=settings`, v1.0.102): Live testing → Settings navigation works; tuning exists only in Settings; revision-10 values render as 8000/8650/5000 ms; no framework overlay, layout overflow, or page exception. The in-app Browser connection stalled during the final run, so this pass used the repo Playwright runtime and explicitly simulated an unsupported `prompt()`; the earlier v1.0.101 in-app Browser run supplied the original failing evidence.

## Coverage gaps / recommendations
- **No coverage reporting** is configured; `coverage/` is gitignored. Consider `node --test --experimental-test-coverage` or c8 for a coverage gate.
- **`data-channel-transfer-protocol.js`** (manifest/chunk/ack/retry) has no dedicated unit test despite being protocol-critical — add one with a fake `RTCDataChannel` pair (mock `bufferedAmount`, message events) covering retry-on-gap, cap enforcement, and completion ordering.
- **Acoustic/motion sensors** are hard to unit-test (Web Audio/DeviceMotion); they are only exercised indirectly. Consider injecting fakes via the existing constructor seams (`ProximityEngine({acoustic,motion})`).
- **i18n** has no test asserting en/ja key parity — a simple key-set diff test would catch missing translations.
- E2E relay/live specs depend on the external Azure server being reachable; they will fail offline. Prefer mock-runtime (`?runtime=mock`) specs for deterministic CI of UI logic.

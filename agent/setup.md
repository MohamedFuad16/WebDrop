# Setup — install, build, run, serve

This is the **only** build-system-specific file. WebDrop v2 frontend has **no build/transpile/bundle step** — it is plain ES modules served statically. (The `azure cloud server/` backend is a separate Node project with its own `package.json`.)

## Prerequisites
- **Node.js** (repo developed on Node 20.x; some dev tools warn about engine ranges but work). `npm` ships with Node.
- A modern Chromium/WebKit browser. Many features (microphone, motion, WebRTC, OPFS) require a **secure context** (`https://` or `localhost`).

## Install
```bash
npm install
```
Runtime deps: `jsqr`, `qrcode-generator`. Dev deps: `@playwright/test`, `playwright`, `ws`. First-time Playwright also needs browsers:
```bash
npx playwright install
```

## Run / serve (dev)
There is no dev server with HMR — just serve the static files. The bundled server is in `scripts/static-server.mjs`:
```bash
npm run serve          # serves repo root at http://127.0.0.1:4178 (no-store caching)
```
Then open `http://127.0.0.1:4178/`. Admin dashboard: `/admin/`. Diagnostics: `/admin/diagnostics.html`.

You may use any static server (e.g. `python3 -m http.server`), but `static-server.mjs` sets the right MIME types and `Cache-Control: no-store` for correct module + service-worker behavior.

## Runtime modes (no build flags — runtime config)
Behavior is controlled at **runtime**, not build time:
- **`js/config/runtime-config.js`** sets `globalThis.WEBDROP_RUNTIME_CONFIG` with the production `signalingUrl`/`turnConfigUrl` and feature toggles (`productionSignaling`, `realProximityCeremony`, `realTransfer`, `qrPairing`). Loaded as a classic script and always fetched `no-store` (see `service-worker.js`).
- **`js/config/runtime-flags.js`** sanitizes those values into the effective flags the app uses. Flags only activate when `productionSignaling` is true **and** a valid `signalingUrl` is present.
- **Force mock mode on localhost:** append `?runtime=mock` to the URL (`isLocalQaMockRuntime`) to bypass the production server and use `MockSignalingAdapter` + simulated proximity/transfer. Great for UI work offline.
- **QA helper:** on localhost, `?qa=incoming-invite` simulates an inbound invite.

No environment variables are read by the frontend. See `secrets.md` for where URLs/tokens live and `api.md` for the backend.

## Service worker / PWA
`service-worker.js` (registered only when **not** on localhost) precaches the app shell (`ASSETS` list) under a versioned cache `webdrop-v2-static-<APP_VERSION>`. Bump `APP_VERSION` (currently `1.0.93`, matching `package.json` `version` and the `?v=1.0.93` import query strings) when shipping cache-affecting changes. Code assets use network-first with cache fallback; `runtime-config.js` is always network-only.

## Runtime proximity policy
The server persists admin tuning at `PROXIMITY_POLICY_PATH` (production default `/var/lib/webdrop/proximity-policy.json`; systemd creates `/var/lib/webdrop` through `StateDirectory=webdrop`). The authenticated Settings form writes the policy over `PUT /api/proximity-policy`. Defaults are 6,000 ms late-tap grace, 6,000 ms acoustic window, and 4,000 ms match slop. A saved update applies to new sessions immediately and survives restart; active sessions keep their original revision.

## Quality / verification scripts (from `package.json`)
```bash
npm run check        # node scripts/check-js.mjs  — static JS checks
npm run audit:secrets# secret scan (check-js.mjs --secrets-only)
npm test             # node --test tests/*.test.mjs  — unit tests
npm run test:e2e     # playwright test
npm run test:relay   # live relay e2e (chromium-desktop)
npm run verify       # check + test
npm run verify:full  # verify + secret audit + npm audit + backend check/test/audit + git diff --check
```
See `tests.md` for the test layout. The backend is built/run separately under `azure cloud server/` (its own README + scripts).

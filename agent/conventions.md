# Conventions & File Placement

**Language/style:** Vanilla ES modules, no framework, no build step. 2-space indent, double quotes, semicolons, `camelCase` functions/vars, `PascalCase` classes, `SCREAMING_SNAKE_CASE` consts. Files are `kebab-case.js`. Prefer small single-responsibility modules; event-driven via the shared `Emitter` base.

**Imports:** relative paths with a cache-busting query: `import { X } from "../utils/foo.js?v=1.0.93";`. Keep the `?v=<APP_VERSION>` suffix consistent with `package.json` version and `service-worker.js` (bump together). No bare/package specifiers in browser code (deps like `jsqr`/`qrcode-generator` are vendored under `js/vendor/`).

## Where new files MUST go (match existing layout)
- **HTML** → repo root (`index.html`) or `admin/` (admin pages). 
- **Styles** → `css/` (one concern per file, e.g. `orbit.css`, `sheets.css`).
- **App JS** → `js/`, by responsibility:
  - `js/core/` — store + controller/orchestration only.
  - `js/services/` — signaling, WebRTC transport, transfer protocol, proximity sensors, capabilities, turn config. New backend integrations or sensors go here.
  - `js/storage/` — persistence backends.
  - `js/ui/` — DOM views / animations.
  - `js/config/` — runtime flags/config, i18n, avatars, tokens.
  - `js/utils/` — tiny shared helpers (no app state).
  - `js/admin/` — operations-dashboard code.
  - `js/vendor/` — third-party libs.
- **Workers** → `workers/`. **Assets** → `assets/`. **Tests** → `tests/` (unit `*.test.mjs`) / `tests/e2e/` (Playwright).
- **Backend** is a separate project: `azure cloud server/` (do not mix with frontend `js/`).

**Rules:** UI never reached from services; controller mutates the store and calls `view.*` (no direct DOM in controller). When adding a precached asset, also add it to `service-worker.js` `ASSETS`. Don't commit secrets (see `secrets.md`).

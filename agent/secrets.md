# Secrets & Config — POINTERS ONLY

**No secret values are stored in this file or anywhere in the agent/ folder.** This is a map of where keys, tokens, URLs, and config live.

## Frontend (this repo root)
- **`js/config/runtime-config.js`** — injects `globalThis.WEBDROP_RUNTIME_CONFIG`: production `signalingUrl` (`wss://…/ws`) and `turnConfigUrl` (`https://…/api/ice-servers`) plus feature toggles. These URLs are **public, non-secret**; this file is committed. Loaded `no-store`.
- **`js/config/runtime-flags.js`** — sanitizes the above into effective flags. No secrets.
- **`js/config/local-admin-token.js`** — **GITIGNORED** (see `.gitignore`). Sets `globalThis.WEBDROP_ADMIN_TOKEN` to the metrics bearer token so a localhost-served dashboard can auto-authenticate. Production does not request this file. **Contains a real token value on disk — never commit it, never copy its value into docs/logs.** Remote operators paste the token into the visible **Admin access** form (kept only in `sessionStorage` under `webdrop.adminToken`).
- **No `.env` is read by the frontend.** No API keys live in committed frontend code.

## Backend (`azure cloud server/` — separate project)
- **`azure cloud server/.env`** (gitignored; template `azure cloud server/.env.example`) holds all server secrets/config:
  - `METRICS_API_TOKEN` — bearer for `/api/diagnostics-public` + `/api/metrics-summary`. Must equal the frontend `WEBDROP_ADMIN_TOKEN`.
  - `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` — Cloudflare TURN credentials. **Server-only; never put in frontend.**
  - `ALLOWED_ORIGINS`, `PUBLIC_ORIGIN`, `PORT`/`HOST`, TTLs, proximity tuning, `ENABLE_METRICS_ENDPOINT`, `ALLOW_STUN_FALLBACK`.
- **Live VM** mirrors these in `/etc/webdrop/signaling.env` (referenced by `local-admin-token.js` comments).

## Token/credential flow (no secrets exposed)
- **TURN/ICE:** the signaling server brokers a short-lived `turnAccessToken` in the WS `connected` message; `turn-config.js` sends it as `Authorization: Bearer …` to `/api/ice-servers`. The frontend never sees the Cloudflare API token.
- **Admin metrics:** dashboard → `Authorization: Bearer <METRICS_API_TOKEN>`.

## Rotation
If `local-admin-token.js` / `WEBDROP_ADMIN_TOKEN` leaks, rotate `METRICS_API_TOKEN` in the server `.env` (and `/etc/webdrop/signaling.env`) and update the local file. Rotate Cloudflare TURN creds in the server `.env` only.

## Do / Don't
- ✅ Reference config by file + variable name (as above).
- ❌ Never paste real token/credential values into commits, docs, the agent/ folder, logs, or chat.

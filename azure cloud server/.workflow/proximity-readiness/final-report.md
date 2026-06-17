# Final Report

Accepted findings:
- Protected signaling messages now require an active accepted pair.
- Pending invites are separate from active pairs; `invite:reject` no longer marks peers connected.
- Proximity scoring is ready but not activated by default.
- Disabled mode no longer computes proximity scores during routed telemetry.
- HTTP API routes have origin checks, per-IP rate limiting, and Permissions-Policy headers.
- WebSocket IP rate limiting uses trusted `X-Real-IP` instead of client-controlled `X-Forwarded-For`.
- nginx now proxies `/api/proximity-policy`.
- deploy scripts exclude `.workflow/` and `.DS_Store`, install tuned nginx config, and support HTTP bootstrap before Certbot.
- smoke script exports `WS_URL`.
- load test sample is conservative by default.

Verification:
- `npm run check` passed.
- `npm test` passed with 12 tests.
- Local smoke passed for health, ICE servers, proximity policy, and WebSocket upgrade.
- Secret scan found no pasted Cloudflare token.
- `git diff --check` passed.

Remaining notes:
- Real Cloudflare credentials must be stored only in `/etc/webdrop/signaling.env`.
- Rotate the previously pasted Cloudflare token before any real deployment.
- The frontend still needs a later adapter/config pass to point at this WSS/TURN backend.

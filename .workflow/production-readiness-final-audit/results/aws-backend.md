# Lane 5: AWS Cloud Server / Backend Audit

Date: 2026-06-15

Scope owned in this lane:

- `aws cloud server/**`, excluding `.env` and `node_modules`
- `.workflow/production-readiness-final-audit/results/aws-backend.md`

Secret handling:

- Did not read or print `aws cloud server/.env`.
- Verification used inline non-secret local env values only.
- Smoke output confirms no TURN bearer token or Cloudflare API token is printed.

Graph-first evidence:

- Root `AGENTS.md` was not present on disk; the user-provided AGENTS instructions were followed.
- Existing repo graph did not include `aws cloud server` nodes.
- Built a temporary backend-only graph from a copy excluding `.env` and `node_modules`.
- `graphify update` rebuilt 177 nodes and 322 edges.
- Graph traversal identified the directly connected audit files: `src/server.js`, `src/signaling-hub.js`, `src/message-schema.js`, `src/rate-limits.js`, `src/proximity-score.js`, `src/qr-token-provider.js`, `src/turn-provider.js`, tests, README protocol/TURN/10k sections, nginx, systemd, scripts, and load config.

Audit findings and fixes:

- WebSocket protocol: validated hello-first flow, protected message routing, pair-required checks, binary rejection, JSON size limits, RTC signal validation, transfer manifest validation, heartbeat cleanup, and origin rejection.
- Auth: confirmed production startup requires `ALLOWED_ORIGINS`; TURN credentials require a live signaling session when `REQUIRE_TURN_AUTH=true`; stale TURN bearer tokens are invalidated on reconnect.
- Rate limits: confirmed per-IP and per-client token buckets exist for signaling plus per-IP HTTP API limiting.
- Proximity score readiness: confirmed default report-only mode and enabled-mode gate. Added coverage proving QR verification can satisfy the proximity gate for paired devices.
- QR token flow: confirmed one-time tokens are pairing-bound and direction-bound; added end-to-end enabled-gate coverage through the signaling hub.
- Cloudflare TURN proxy: confirmed the long-term API token remains server-side; browser receives only temporary ICE servers after the live-session bearer check.
- HTTP API CORS: fixed `/api/relay-policy`, `/api/proximity-policy`, and authorized `/api/metrics-summary` responses to include CORS headers for allowed origins.
- Smoke testing: fixed `scripts/smoke-test.sh` so production `REQUIRE_TURN_AUTH=true` works by opening WebSocket first, reading the ephemeral TURN bearer from `connected`, and then calling `/api/ice-servers`.
- Docs: updated production smoke command to include an allowed `ORIGIN`, matching the WebSocket origin enforcement path.
- nginx/systemd/scripts/10k docs: reviewed tuned nginx worker/file descriptor settings, systemd `LimitNOFILE=200000`, install sysctl/limits setup, deploy/certbot scripts, and conservative Artillery load file. No secret-bearing output required.

Verification:

```bash
cd "aws cloud server"
npm run check
npm test
bash -n scripts/smoke-test.sh scripts/deploy.sh scripts/install-ec2-ubuntu.sh scripts/certbot-init.sh
HOST=127.0.0.1 PORT=18080 ALLOWED_ORIGINS=http://allowed.example REQUIRE_TURN_AUTH=true ALLOW_STUN_FALLBACK=true node src/server.js
BASE_URL=http://127.0.0.1:18080 WS_URL=ws://127.0.0.1:18080/ws ORIGIN=http://allowed.example bash scripts/smoke-test.sh
```

Results:

- `npm run check`: pass
- `npm test`: pass, 26 tests
- script syntax checks: pass
- local auth-enabled smoke test: pass

Remaining production assumptions:

- Rotate any previously shared Cloudflare TURN token before real deployment.
- Keep real Cloudflare credentials only in `/etc/webdrop/signaling.env`.
- Keep `REQUIRE_TURN_AUTH=true` outside isolated local tests.
- Run staged load tests on the actual EC2 size before claiming a hard 10,000 concurrent-client capacity.
- Add CloudWatch/process metrics and shared presence before horizontally scaling beyond one Node process.

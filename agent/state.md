# Project State

## Current state summary (≤200 words)
Client **v1.0.127** is live at `webdrop.mohamedfuad.com` (Vercel). Signaling is at `signal.mohamedfuad.com`. Per the 2026-10-14 entry, that name now resolves to the Azure VM `vm-apps-small` (52.246.184.110, japaneast, Caddy, signaling on 127.0.0.1:8081). It no longer points at the AWS host in ADR-0033. ADR-0035 records the move (AWS credit ran out) and supersedes ADR-0033's host details.

Every new frontend domain needs its own entry in `ALLOWED_ORIGINS` in `/etc/webdrop/signaling.env`. A refused origin leaves no server log (see errors.md).

Pairing uses ultrasound, bump and tilt, with a server-persisted proximity policy. Multi-pair matching, `client:profile` edits (ADR-0034) and the Monaca second host (ADR-0031) are in place.

Older history: `agent/archive/state-history.md` holds the full pre-trim text of every entry below. Gotchas: `agent/archive/errors-full.md`. Full ADRs: `agent/archive/decisions-full.md`.

## Recent changes
- **2026-10-14 — Outage fix: `webdrop.mohamedfuad.com` was refused by signaling (server config only, no code change, no version bump):** The owner reported WebDrop down. The frontend (v1.0.127 on Vercel) and the signaling service were both up, and `/readyz` was healthy. Root cause: the live `ALLOWED_ORIGINS` in `/etc/webdrop/signaling.env` listed `https://web-drop-lyart.vercel.app` but not the new custom domain `https://webdrop.mohamedfuad.com`, so the hub answered every WebSocket upgrade from that domain with `403` (no server log, see errors.md). Fix on the VM: backed up the env to `/etc/webdrop/signaling.env.bak-2026-10-14`, appended the origin, restarted `webdrop-signaling`; `/readyz` now reports 11 allowed origins. Verified: upgrade with `Origin: https://webdrop.mohamedfuad.com` 403 → 101, the Vercel origin stays 101, an unlisted control origin stays 403, and a WebSocket opened from the live page received `server:ready`. Not verified: a full two-phone pairing. Also added the domain to `azure cloud server/.env.example` `ALLOWED_ORIGINS`. **Hosting drift (observed, not recorded before):** `signal.mohamedfuad.com` now resolves to Azure VM `vm-apps-small` (RG `rg-mfuad-apps`, japaneast, `52.246.184.110`, Standard_B2pts_v2), not the AWS EIP in ADR-0033. That VM is shared: Caddy serves `api.`, `signal.`, `ledger-api.` and `tutorsystem.mohamedfuad.com`, with signaling on `127.0.0.1:8081`. The Azure activity log shows the VM rebuilt on 2026-10-04. `16-76-107-155.nip.io` did not answer. Treat ADR-0033's host details as stale until an ADR records the move.
- **2026-10-14: Project memory trimmed to memcheck limits (docs only, no code change):** Moved old content verbatim into `agent/archive/` (`state-history.md`, `decisions-full.md`, `errors-full.md`). `state.md` keeps this summary, the full 2026-10-14 entry above and a one-line index of older entries. `decisions.md` keeps an index of every ADR plus the full text of ADR-0033 and ADR-0034. `errors.md` keeps each gotcha in shortened form. Dead paths fixed or unwrapped in the files memcheck scans. `agent.md` was not touched in this pass. (Corrected 2026-10-14: pass 2 cut it to 197 words and added the `agent/archive/` row.)

Older entries, one line each. Full text is in `agent/archive/state-history.md`.

- 2026-10-14: Memory trim pass 2: agent.md cut under 200 words, dead paths fixed in architecture.md and backlog.md.
- 2026-10-14: ADR-0035 records the 2026-10-04 move of signaling from AWS EC2 back to the shared Azure VM `vm-apps-small`, because the AWS credit ran out. The owner reports the EC2 instance is terminated (not checked: AWS CLI session expired). The `aws-ec2-*.sh` scripts are history only.
- 2026-09-24: Profile edits no longer trigger "connection could not be confirmed" (client + server, ADR-0034, BOTH DEPLOYED)
- 2026-08-12: Custom domain: signaling now at signal.mohamedfuad.com (follow-up to ADR-0033)
- 2026-08-12: Production signaling repointed to AWS EC2 (infra, ADR-0033). The archived text of this entry also contains, merged in by an old edit, the v1.0.125 ceremony clock-base bug write-up (ADR-0032).
- 2026-07-14: Monaca hosting made to actually work + first-run tour + disconnect icon (client v1.0.124, ADR-0031)
- 2026-07-12: Post-release audit re-verification + fixes, desktop QR-direct + tour pagination (client v1.0.123 + server)
- 2026-07-12: Multi-pair simultaneous connect, Phases 1+2 (client v1.0.122 + server, ADR-0030, BOTH DEPLOYED)
- 2026-07-11: Tour audit round: 3-agent sweep, 12 fixes (v1.0.121)
- 2026-07-11: Tour welcome-orbit clipping fix (v1.0.120)
- 2026-07-11: Offline avatar precache + user-01.png downscale (v1.0.119)
- 2026-07-11: Guided-tour polish round + new app icon (v1.0.117)
- 2026-07-10: "How to use WebDrop" guided tour (v1.0.116, DEPLOYED, disabled by default)
- 2026-07-10: Agent round 2: session-scoped waiters + de-synced bump cues + veto hygiene (client v1.0.114 + server, ADR-0028, BOTH DEPLOYED ~07:25 UTC)
- 2026-07-10: Two-agent bug sweep: UI phantom "Bump detected" gate + live tilt readout (client v1.0.112) + bump tombstones / membership eviction / reconnect preservation (server) (ADR-0027, deploy status: see below)
- 2026-07-09: Denied-permission ceremony abort (client, v1.0.111) + same-cohort match deferral (server) (ADR-0026, BOTH DEPLOYED)
- 2026-07-09: Multi-pair cohort matcher: 2-device-only winner margin + cross-cohort bump veto with deferred matching (server-only, ADR-0025, DEPLOYED)
- 2026-07-09: Phantom "bump detected" on 2nd device / reconnect: discard pre-window motion at ceremony startAt (client-only, ADR-0024, v1.0.110, DEPLOYED — field-verified)
- 2026-07-09: 4-device/2-pair matcher fixes: match-all-disjoint-pairs + bump-partner veto (server-only, ADR-0023)
- 2026-07-09: Desktop download fix (StreamSaver vs root service worker) + island transfer HUD layout fix (v1.0.109, client-only)
- 2026-07-09: Repo synced + Monaca hosting zip produced (packaging only, no code change)
- 2026-07-04: Smooth transfer percent + stable sizing (v1.0.108, client-only)
- 2026-07-04: Post-v1.0.106 verification audit + 2 hardening fixes (v1.0.107, client-only)
- 2026-07-04: First-attempt pairing fixes (dead lanes 0/1, telemetry expiry, iOS warm-up) + staged ceremony UI (v1.0.106)
- 2026-07-03: Complete post-v1.0.104 audit + 9 fixes, concurrency focus (v1.0.105)
- 2026-07-03: Reliability overhaul: silent-mic fix, immediate-bump, band expansion, faster connect, permissions, multi-tab, magic link (v1.0.104)
- 2026-07-02: Admin authentication is visible and usable in every browser (v1.0.103)
- 2026-07-02: Tokenless admin dashboard no longer logs unsupported prompt errors (v1.0.102)
- 2026-07-02: Safari microphone prompt no longer blocked by stale local denial (v1.0.101)
- 2026-07-02: Final telemetry ack/retry exposes the real post-gap failure (v1.0.100)
- 2026-07-02: Truthful failure message when the pair can't reciprocally confirm (v1.0.99)
- 2026-07-02: Bump detection tuned lower to fix "bump_not_detected" in live tests (v1.0.98)
- 2026-07-02: App fixes: ghost-peer prune, reliable View-in-new-tab, hard cache reset, hold-diagram redesign (v1.0.97)
- 2026-07-02: Admin dashboard round 2: single/two-device rebuild, settings refresh, hold diagrams, dead-code purge (v1.0.96)
- 2026-07-02: Admin dashboard overhaul: SW cross-origin fix, live-testing restructure, settings sliders (v1.0.95)
- 2026-07-02: Admin dashboard polish, mobile responsiveness, JP completeness, honest readiness (v1.0.94)
- 2026-07-02: Pre-campaign production verification; physical run still pending (no code change)
- 2026-07-01: Runtime proximity tuning + repeatable multi-device test console (v1.0.93)
- 2026-06-30: Tiles-as-progress HUD, swipe polish, live profiles (v1.0.92)
- 2026-06-30: Dark-theme halo + stale-QR follow-up (v1.0.91)
- 2026-06-30: UI polish + personalized QR (v1.0.90)
- 2026-06-29: Diagram layout fix
- 2026-06-29: Bootstrap

<!-- Append new dated entries above this line as the project evolves. Keep the summary current. -->

# Architecture Decision Records (ADRs)

Append-only. Newest at the bottom. Format: ID · date · title · status · context · decision · consequences. These initial ADRs are **reverse-engineered** from the existing architecture to capture the rationale evident in the code.

---

Trimmed on 2026-10-14. The index lists every ADR. Full text of ADR-0033 and ADR-0034 is below. All other ADRs, unchanged, are in `agent/archive/decisions-full.md`. ADR-0033's host details are stale in practice: see the 2026-10-14 entry in state.md.

## Index
- ADR-0001 · 2026-06-29 · Use WebRTC data channels for file transfer
- ADR-0002 · 2026-06-29 · Provide a mock signaling + simulated runtime fallback
- ADR-0003 · 2026-06-29 · Multi-factor physical-proximity verification (ultrasound + motion, QR fallback)
- ADR-0004 · 2026-06-29 · Ship as a no-build static PWA with a layered storage ladder
- ADR-0005 · 2026-06-29 · Render the architecture diagram with D2's ELK engine
- ADR-0006 · 2026-06-30 · Personalize the connection QR with an avatar badge (level H)
- ADR-0007 · 2026-06-30 · The transfer HUD is the tile-wave itself (no separate bar)
- ADR-0008 · 2026-06-30 · Propagate live profile changes over the data channel (+ best-effort presence)
- ADR-0009 · 2026-07-01 · Persist and snapshot runtime proximity policy; record tests against revisions
- ADR-0010 · 2026-07-02 · Admin readiness reflects real health/proof; dashboard is mobile-first and bilingual
- ADR-0011 · 2026-07-02 · Service worker must not touch the cross-origin API; admin console restructured for live testing
- ADR-0012 · 2026-07-02 · Single-device test drops reciprocal-audio rows; two-device test shows full per-device panels
- ADR-0013 · 2026-07-02 · Roster prunes departed peers; View reserves a tab every click; SW hard-resets caches per version
- ADR-0014 · 2026-07-02 · Lower bump-detection threshold to 4.5 m/s² for real-world reliability
- ADR-0015 · 2026-07-02 · Failure message reflects reciprocal-acoustic reality, not a phantom "no bump"
- ADR-0016 · 2026-07-02 · Ack final proximity telemetry before waiting for server match
- ADR-0017 · 2026-07-02 · Safari microphone denial cache must not suppress the next user gesture
- ADR-0018 · 2026-07-02 · Admin token prompt must fail closed without console errors
- ADR-0019 · 2026-07-02 · Admin authentication must be a visible session-only workflow
- ADR-0020 · 2026-07-03 · Reliability overhaul — deterministic pairing, iOS mic hardening, band expansion, multi-tab, magic link
- ADR-0021 · 2026-07-03 · Cap the acoustic band at 19.8kHz for 44.1kHz-device Nyquist safety (post-v1.0.104 audit, v1.0.105)
- ADR-0022 · 2026-07-04 · First-attempt pairing fixes (lane-0/1 filter fossil, telemetry expiry race, tap-time acoustic preflight) + staged ceremony UI (v1.0.106)
- ADR-0023 · 2026-07-09 · Multi-pair cohort matcher: match all disjoint pairs + bump-partner veto (server-only)
- ADR-0024 · 2026-07-09 · Discard pre-window motion at ceremony startAt (phantom "bump detected" on 2nd device / reconnect; client-only)
- ADR-0025 · 2026-07-09 · Multi-pair cohorts: 2-device-only winner margin + cross-cohort bump veto with deferred matching (server-only)
- ADR-0026 · 2026-07-09 · Abort doomed ceremonies on denied motion/mic (client, v1.0.111) + hold cohort matches for unreported members (server)
- ADR-0027 · 2026-07-10 · Two-agent bug sweep round: UI phantom-bump gate + tilt readout (client, v1.0.112) + bump tombstones, membership eviction, reconnect preservation (server)
- ADR-0028 · 2026-07-10 · Session-scoped waiters + de-synced cohort bump cues + veto hygiene (client v1.0.114 + server)
- ADR-0029 · 2026-07-11 · Guided tour presents as a bottom sheet; new WebDrop brand icon asset (v1.0.117)
- ADR-0030 · 2026-07-12 · Simultaneous multi-pair connect: cap fix, turn-taking bump cues, overlap stagger, split-pair regroup, wait-state UX (client v1.0.122 + server)
- ADR-0031 · 2026-07-14 · Monaca as a second host: per-project origin allowlisting, and a Monaca-only `.mjs`→`.js` rewrite (v1.0.124)
- ADR-0033 · 2026-08-12 · Production signaling host: Azure VM → AWS EC2, Caddy replaces nginx+certbot (infra, no version bump)
- ADR-0032 · 2026-07-16 · Ceremony island: convert server epoch cue timestamps into the local monotonic clock (v1.0.125)
- ADR-0034 · 2026-09-24 · Post-handshake profile edits use `client:profile`; `unsupported_type` is not a pairing failure

---

## ADR-0033 · 2026-08-12 · Production signaling host: Azure VM → AWS EC2, Caddy replaces nginx+certbot (infra, no version bump)

**Context.** The whole backend estate is migrating off Azure ($100 AWS credit, owner decision). The signaling hub ran on Azure VM `webdrop-wss-02` (Standard_D2s_v3, ~723MB RSS observed — massively oversized) behind nginx + certbot with a per-route proxy config for `webdrop-wss-0618.japaneast.cloudapp.azure.com`. An ALB was rejected: TLS at a load balancer invites multi-process scaling, and the hub's cohort/pairing state is single-process in-memory by design (`signaling-hub.js` Maps; ADR-0023..0030 all assume one clock, one matcher).

**Decision.** EC2 `i-033324ec6baf53aca` (t4g.micro arm64, Tokyo) + Elastic IP `16.76.107.155`, hostname `16-76-107-155.nip.io` (wildcard DNS → automatic Let's Encrypt via **Caddy**, 3-line Caddyfile, catch-all `reverse_proxy 127.0.0.1:8080` — WS upgrades handled natively, so the per-route nginx blocks and certbot cron are gone entirely). The server tree was rsynced byte-identical from the VM (same `/opt/webdrop/azure-cloud-server`, same `signaling.env`, same systemd unit, **live runtime policy revision 10 carried over**), so the deployed hub is the ADR-0030-era code, not a rebuild. Repo repoint: `js/config/runtime-config.js`, `js/admin/readiness.js` defaults, the two e2e route pins, `deploy.sh` DOMAIN default; `azure cloud server/scripts/aws-ec2-start.sh`/`aws-ec2-stop.sh` added beside the azure ones (stop-not-terminate so the EIP and hostname survive).

**Consequences.** Because the service worker serves `runtime-config.js` no-store, live Vercel clients repoint on next page load with no SW upgrade. The Azure VM stays running during transition: Monaca-packaged copies embed the old host until re-imported from a fresh `build-monaca` run, and the old hostname dies only when the VM is deallocated (owner's call). nip.io ties the public name to the EIP — releasing the EIP breaks the hostname and the cert. Costs: ~$8/mo instance vs ~$95/mo Azure D2s_v3.

## ADR-0034 · 2026-09-24 · Post-handshake profile edits use `client:profile`; `unsupported_type` is not a pairing failure

**Context.** Settings edits (name, icon, ring) re-sent `client:hello` on the open socket to re-announce presence. The hub accepts `client:hello` only as the first frame, so every edit produced `protocol:error unsupported_type`, which the controller showed as "The nearby connection could not be confirmed." even though no pairing was in progress. The profile change also never reached other devices' peer lists.

**Decision.** Add a `client:profile` message. The server validates only presentational fields (`deviceName`, `avatarId`/`avatar`, `ringColor`), never changes `id`/`deviceId`, and rebroadcasts `peers` only when a field changed. A repeated `client:hello` from an already-registered socket takes the same path so clients cached before this change stop erroring once the server is deployed; it does not re-register, issue a new TURN token, or send `connected`. The controller treats `unsupported_type` as client/server version skew and logs it instead of toasting `connectionRejected`. Reconnecting the socket to push a new hello was rejected because `removeClient` tears down active pairings.

**Consequences.** Deploy order does not matter for the toast: a new client on the old server stays quiet but its profile edits do not propagate over signaling until the server is deployed (the data-channel `profile:update` to a connected peer is unaffected). Per-client rate limiting covers profile spam; the controller already debounces broadcasts by 250 ms.

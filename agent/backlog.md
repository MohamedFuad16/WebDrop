# Backlog — outstanding issues & roadmaps

Open items from the 2026-07-10 specialist reviews (ADR-0027/0028). Each entry
names its source so the full analysis can be found in `decisions.md` or the
session transcripts. Remove entries when shipped (and record the fix as an ADR
entry / state.md note).

## P1 — Multi-pair pairing roadmap (pairing research, ADR-0028)

Goal: multiple pairs pairing at the same moment in one room, reliably.
Shipped already: cohort bump-cue de-sync (stagger 1200ms), veto hygiene,
first-crossing bumpAt. Remaining steps, in order:

1. **Instrumentation (S/M)** — client `acoustic-proximity.js` decode: also
   correlate the OWN signature (`ownChirpSampleOffset`) and compute per-slot
   `slotRms`, `slotPeak`, `clipFraction`; client `motion-proximity.js`: bounded
   ring buffer (~256 samples) of `{at, linear, gravityDelta}` exposed via
   `getWaveform()`, ±500ms slice shipped in diagnostics; mic
   `track.getSettings()` (autoGainControl etc.) echoed into `getHealth()`.
   Server: log BeepBeep two-way time-of-flight distance for every candidate
   pair in `tryMatchProximitySession` (SHADOW mode — never gate). Answers the
   open questions: why touching partner decodes at 0.102 vs 2m phone at 0.447
   (clipping? occlusion? AGC?); is ToF accurate in the bump pose?
2. **Per-device solo bump cues (M)** — for cohorts > 2, extend
   `proximity:session:start` with per-client `bumpCueAt` (like `acousticSlot`,
   ~1500ms apart); island shows "Hold still…" until own cue; matcher requires a
   pair's bumps to co-occur within one cue slot. Makes 4-6 device cohorts
   deterministic regardless of decode margins. May need a larger
   `acousticWindowMs` for big cohorts.
3. **Cohort merge for simultaneous tappers (M)** — extend the 2-member
   fast-start linger while another session started within ~2.5s; in
   `startProximitySession`, absorb other un-started open sessions' members
   before the acoustic plan is built. Removes crossed splits entirely.
4. **Promote ToF to a matcher gate (S, data permitting)** — if shadow data
   confirms touching < ~0.5m and cross-pair > ~1m: prefer minimum-distance
   disjoint pairing, reject pairs above threshold. Replaces "cleanest decode
   wins" with measured distance and STRENGTHENS anti-relay (relay latency →
   distance explodes).

## P2 — Architecture roadmap (architecture review, ADR-0028)

- **R1 `ProximityAttempt` object (M)** — one object per Connect tap owning:
  generation, sessionId, clientNonce, startPayload, the five session waiters,
  acousticPreflight, permissionPromise, lastProximityFailure,
  failedProximityPeerId, activeConnectionMethod/QrRole, sensor ownership
  (`attempt.dispose()`), one `settle(outcome)`. Eliminates the waiter-race /
  stale-continuation bug class. First step (~60 lines): move the five
  resolvers + proximitySessionId + lastProximityFailure into a
  `currentAttempt` object.
- **R2 version-bump script + gate (S)** — `scripts/bump-version.mjs` rewriting
  every `?v=`, both `APP_VERSION`s, package.json/lock; assertion in
  `scripts/check-js.mjs` (already in `npm run verify`) that all of them equal
  `package.json.version`. Kills the mixed-version double-module-instance class.
  Do the check first.
- **R3 server session-owned lifecycle (M)** — single
  `destroyProximitySession(session, {tombstoneUnmatched})` used by all four
  teardown sites; fold `pruneProximitySessionClients`' inline eviction into
  `evictProximitySessionMember`; later promote to a `ProximitySession` class.
  Every wrong-pair ADR was a missed hook at a hand-maintained teardown site.
- **R4 extract admin acoustic monitor (S)** — controller lines ~447-643 + 3
  state fields → `js/services/admin-monitor.js` with explicit pause/resume;
  removes the hidden `stopProximitySensors → setTimeout(tryStartAdminAcousticMonitor, 180)`
  mic re-acquisition during ceremony retries.
- **R5 pure ceremony-stage reducer + controller harness test (S/M)** — extract
  `ceremonyStageForEvent` + monotonic advance into a pure module (the
  phantom-bump field bug becomes a 5-line unit test); add one node-test
  instantiating `createController` with `MockSignalingAdapter` + stub view to
  pin waiter semantics.

## P3 — Deferred defects (verified, not yet fixed)

- **Stale `proximitySessionId` overwrite (low, ADR-0027 deferred)** — an
  unsolicited `proximity:session:joined` for a previous attempt can still
  overwrite the current id before the new attempt joins (the `start` handler is
  now waiter-scoped; `joined` assignment still trusts any consumed frame).
  Proper fix arrives with R1's waiter-owned assignment.
- **Ceremony flow duplication (arch F5, med)** — `runRealProximityCeremony`
  (invite path) vs `runRealProximitySessionCeremony` (anonymous path) are ~85%
  duplicated and have drifted: the invite path lacks the sync-phase
  self-test/preflight handshake, and the server's legacy pairwise path still
  hardcodes `startAt: Date.now() + 1200` (`signaling-hub.js` ~:1597) — never
  received the ADR-0020 startDelay 700 fix. Merge after R1.
- **Keyed waiter timeouts delete the current owner (arch F4, med)** —
  `waitForMapValue`-style timeouts `map.delete(key)` without checking the
  entry is still their own resolver; masked by `clearVerificationWaiters`
  discipline today. Fixed structurally by R1.
- **QR waiters never settle (arch F9, low)** — `clearQrTransientWaiters` nulls
  resolvers without resolving; `qrFallbackResolver` is written/consumed from
  three unrelated places.
- **Duplicate-tab UX (server F6 residue, low)** — the pruned duplicate-device
  tab now gets `proximity:session:failed { reason: "replaced_by_same_device" }`,
  which maps to the generic failure string; add a specific i18n message.

## P4 — Pending audits

- **UI-doctor audit** — first run died on a session limit; rerun launched
  2026-07-10 ~20:38 JST; findings to be triaged into this file.
- **Field experiments** (pairing research, exact telemetry listed in
  ADR-0028/session): near-field level vs correlation; ToF accuracy in bump
  pose; 60Hz accel waveform discrimination AUC; clock-skew share of the
  30-100ms partner delta; cohort split/tap-spread distribution.

# WebDrop Concepts & Technology Revision Guide

App version: `1.0.86`

This is a **study guide**. It explains every concept, protocol, and method
WebDrop relies on **from first principles** — with a plain-language analogy, a
short "how it actually works", a tiny example, and a one-line "how WebDrop uses
it". It is meant for revising the *ideas*.

- To revise the **concepts** (this doc) vs. understand the **implementation**:
  read [`webdrop-app-documentation.md`](webdrop-app-documentation.md) for how the
  app is actually built and wired.
- For exact proximity **numbers** and the ultrasonic schedule, see
  [`webdrop-proximity-scoring-and-tdma.md`](webdrop-proximity-scoring-and-tdma.md).

The second half of this guide is a **Multi-device pairing Q&A** that answers the
practical "what happens if…" pairing questions, each grounded in the current
code with file citations.

---

## Part 1 — Concept cards

### 1. Static web app (HTML / CSS / JS over HTTPS)

- **One line:** three text files — structure (HTML), looks (CSS), behaviour (JS)
  — that the browser downloads and runs, no install.
- **Analogy:** a printed pop-up book. HTML is the pages and tabs, CSS is the art
  and layout, JS is the mechanism that makes the pop-ups move.
- **How it works:** the browser parses HTML into a DOM tree, applies CSS rules,
  and runs JS that can change the DOM. HTTPS (HTTP over TLS) encrypts the
  download and unlocks "powerful" APIs (mic, motion, service workers, WebRTC)
  that browsers only allow on a *secure origin*.
- **Tiny example:** `<button id="go">Go</button>` +
  `document.getElementById("go").onclick = …`.
- **In WebDrop:** the whole app is static; HTTPS is mandatory because every
  proximity/transfer API needs a secure origin.

### 2. ES modules

- **One line:** JavaScript files that `export` and `import` named pieces.
- **Analogy:** Lego bricks with labelled studs — each file says what it offers
  and what it needs.
- **How it works:** `<script type="module">` loads one entry file; the browser
  follows `import` links and loads the graph once, each module evaluated a single
  time.
- **Tiny example:** `export function add(a,b){return a+b}` ↔
  `import { add } from "./math.js"`.
- **In WebDrop:** `js/app.js` imports the store, view, services, and controller —
  no bundler. (`?v=1.0.86` on imports is a cache-buster.)

### 3. Service worker & offline cache

- **One line:** a background script that can answer the page's network requests.
- **Analogy:** a building receptionist who keeps copies of common documents, so
  you get them instantly even when the post office is closed.
- **How it works:** installed once, it intercepts `fetch` events and can serve
  from a cache. Versioning the cache name forces a clean refresh.
- **In WebDrop:** `service-worker.js` pre-caches the app shell and serves it
  offline, but always fetches `runtime-config.js` fresh so the live server URL
  is never stale.

### 4. WebSocket vs WSS

- **One line:** a persistent two-way connection; `wss://` is the encrypted (TLS)
  version, like `https://` vs `http://`.
- **Analogy:** an open phone line both people can speak on at any moment.
  Plain `ws://` is a postcard line (readable); `wss://` is a sealed line.
- **How it works:** the client sends an HTTP "Upgrade" request; the server
  switches the TCP connection to the WebSocket protocol, after which both sides
  push messages freely. With `wss://`, TLS wraps it; an edge proxy usually
  terminates that TLS.
- **Why not just HTTP polling?** Polling is "are we there yet?" on a timer;
  WebSocket pushes instantly and cheaply — ideal for signaling.
- **In WebDrop:** the browser opens `wss://…/ws`; **nginx terminates TLS and
  upgrades** the connection to the local Node process. Only small JSON metadata
  travels here — never file bytes.

### 5. The TLS / WSS upgrade at the edge

- **One line:** the public connection is encrypted `wss://`, but inside the
  server the proxy talks plain `ws://` to the local app.
- **Analogy:** an embassy: armoured doors face the street (TLS at nginx), normal
  hallways inside (plain `ws` to `127.0.0.1:8080`).
- **How it works:** nginx holds the certificate, decrypts, and forwards the
  upgraded WebSocket to the app bound to localhost. The app never handles raw
  certificates.
- **In WebDrop:** `azure cloud server/nginx/` + Certbot manage TLS; Node binds to
  `127.0.0.1` and never faces the internet directly.

### 6. WebRTC (the big picture)

- **One line:** browser tech for **direct, encrypted, peer-to-peer** connections.
- **Analogy:** two friends want to talk directly. A switchboard operator
  (signaling server) helps them exchange phone numbers, but once connected they
  talk *directly*, not through the operator.
- **How it works:** an `RTCPeerConnection` describes each side, gathers network
  candidates, tests paths, and then carries media or **data channels**. WebDrop
  uses only **data**.
- **In WebDrop:** `js/services/webrtc-transport.js`; file bytes ride an
  `RTCDataChannel`, keeping them off the server entirely.

### 7. SDP offer / answer (WebRTC signaling)

- **One line:** a text description of "what I support and how to reach me",
  exchanged once to set up the connection.
- **Analogy:** swapping business cards before a meeting: languages spoken,
  addresses, encryption keys.
- **How it works:** caller `createOffer()` → `setLocalDescription` → send;
  callee `setRemoteDescription` → `createAnswer()` → `setLocalDescription` →
  send back. **Signaling** is just the courier that carries these blobs — it can
  be anything; WebRTC doesn't define it.
- **In WebDrop:** the offer/answer ride the WebSocket as `rtc:signal`; the server
  only relays them between the two paired clients.

### 8. NAT (why direct connections are hard)

- **One line:** your router shares one public IP among many devices and blocks
  unsolicited inbound traffic.
- **Analogy:** an office with one street address and many staff. Outsiders can't
  reach "desk 14" directly; the front desk maps replies back.
- **How it works:** NAT (Network Address Translation) rewrites internal
  `192.168.x.x:port` ↔ public `IP:port`. When your phone sends a packet out, the
  router writes down "internal 192.168.1.5:51000 is using public 203.0.113.7:40000
  right now" and rewrites the addresses. Replies to `203.0.113.7:40000` are mapped
  back to your phone. But nobody on the internet can *start* a conversation with
  `203.0.113.7:40000` unless your phone opened that mapping first — so two NATed
  peers cannot simply dial each other.
- **NAT types (why some calls need a relay):**
  - **Full-cone / restricted-cone / port-restricted:** the router reuses the
    *same* public port for a given internal socket, so once a hole is punched, a
    peer can usually reach it. These are friendly to direct WebRTC.
  - **Symmetric NAT:** the router picks a *different* public port for every
    destination. Hole-punching fails because the address your peer learned via
    STUN is not the one your router will accept their packets on. **Symmetric NAT
    on either side is the classic reason a call falls back to a TURN relay.**
- **Tiny example:** behind cone NAT, STUN tells you `203.0.113.7:40000` and your
  peer can reach you there. Behind symmetric NAT, STUN says `…:40000` but your
  router actually opened `…:40001` toward your peer, so direct fails and ICE
  promotes the `relay` candidate.
- **In WebDrop:** this is the reason STUN/TURN/ICE exist at all. Most pairs go
  direct; symmetric-NAT or locked-down networks are exactly when WebDrop's
  Cloudflare TURN relay (capped at 500 MB, shown to the user) earns its keep.

### 9. STUN

- **One line:** a server that tells you your own public address.
- **Analogy:** calling a friend to ask "what number shows up on your caller ID
  when I call you?"
- **How it works:** the browser asks a STUN server; the reply reveals the
  public `IP:port` (a *server-reflexive* / `srflx` candidate) that NAT assigned.
  STUN is cheap and stateless — no traffic flows through it after discovery.
- **In WebDrop:** Cloudflare STUN (`stun:stun.cloudflare.com:3478`) is the
  fallback in `js/services/turn-config.js`; the backend includes STUN in the ICE
  list it returns.

### 10. TURN / relay

- **One line:** a relay server that forwards your data when no direct path works.
- **Analogy:** if two friends can't connect directly, they both call a mutual
  contact who passes messages along — slower, and the contact's "phone bill" is
  real.
- **How it works:** both peers send to the TURN server, which relays packets
  between them. TURN needs credentials and costs bandwidth, so it's a last
  resort.
- **In WebDrop:** Cloudflare TURN. The long-lived key stays server-side; the
  backend (`turn-provider.js`) mints **short-lived** credentials handed to the
  browser via `GET /api/ice-servers`. Relay transfers are capped (500 MB) and
  shown to the user.

### 11. ICE (tying STUN/TURN together)

- **One line:** the algorithm that gathers all possible addresses and picks one
  that works.
- **Analogy:** trying every door — front (host), side (srflx via STUN), and the
  guaranteed-but-slow back entrance through a courier (relay via TURN) — and
  keeping whichever opens.
- **How it works, in three phases:**
  1. **Gather candidates.** Each side collects `host` (LAN), `srflx` (public
     address via STUN), and `relay` (TURN) addresses. Each candidate is sent to
     the peer over signaling as it is discovered (this "trickle ICE" overlaps
     gathering with checking, so setup is faster).
  2. **Connectivity checks.** ICE pairs up every local candidate with every
     remote candidate and sends STUN "binding request" probes across each pair.
     A pair becomes *valid* when a probe and its response both succeed — that is
     literally how NAT hole-punching happens: the outgoing probe opens the
     mapping the reply needs.
  3. **Nomination.** Among the valid pairs, ICE prefers the highest-priority one
     (host/srflx before relay) and nominates it as the path the data channel
     uses. If the chosen path later dies, ICE can re-check and fail over.
- **Tiny example:** candidate priorities roughly rank `host > srflx > relay`, so
  two laptops on the same Wi-Fi connect over `host` and never touch STUN/TURN;
  two phones on different mobile networks usually settle on `srflx`, and only a
  hostile NAT forces `relay`.
- **In WebDrop:** the ICE servers come from `GET /api/ice-servers`
  (`turn-config.js`); after connection, `classifyPathFromStats()` inspects the
  selected candidate pair and labels the path `direct` or `relay`, and the UI
  applies the 500 MB relay cap accordingly.

### 12. DTLS / SCTP (data-channel encryption)

- **One line:** the data channel runs SCTP over DTLS, so every byte is encrypted
  in transit automatically.
- **Analogy:** the courier's pouch is locked (DTLS) and the contents are
  numbered and sequenced so nothing is lost or reordered (SCTP).
- **How it works:** once ICE picks a path, the two browsers run a **DTLS
  handshake** (TLS adapted for packet/datagram transport): they exchange
  certificates and agree on encryption keys, and each side verifies the other's
  certificate fingerprint — the fingerprint was already published inside the SDP,
  so a man-in-the-middle who tampered with the media can't match it. On top of
  that secure channel runs **SCTP**, which adds message framing plus *ordered,
  reliable* delivery (configurable, but WebDrop uses the reliable/ordered mode):
  data is split into numbered chunks, lost chunks are retransmitted, and messages
  arrive in order — TCP-like guarantees, but peer-to-peer.
- **Tiny example:** you never call "encrypt" yourself. `channel.send(bytes)` is
  already DTLS-encrypted on the wire and SCTP-sequenced; the receiver's
  `onmessage` fires with the same bytes, in order.
- **In WebDrop:** this is why WebDrop doesn't add its own transport encryption —
  but it *does* add manifests + per-file SHA-256, because encryption doesn't
  define *file boundaries* or *integrity* (it protects the pipe, not the meaning
  of the bytes).

### 13. RTCDataChannel, chunking & backpressure

- **One line:** a reliable message pipe; large files are split into chunks, and
  the sender slows down when buffers fill.
- **Analogy:** pouring water through a funnel — pour too fast and it overflows.
  You watch the funnel level and pour in steady cupfuls.
- **How it works:** `channel.send(chunk)` queues bytes; `channel.bufferedAmount`
  reports the backlog still waiting to go out. You pause when it crosses a high
  mark and resume on the `bufferedamountlow` event (which fires when the backlog
  drains below `bufferedAmountLowThreshold`). Files are sliced into fixed-size
  chunks so memory and retries stay bounded.
- **Tiny worked example:** a 250 MB file at 256 KiB/chunk is ~1,000 chunks. The
  sender pushes chunks until `bufferedAmount` is high, stops, waits for
  `bufferedamountlow`, then continues — so RAM holds a few chunks, not 250 MB.
  Without backpressure the queue would grow unbounded and the tab could crash.
- **In WebDrop:** two ordered channels (`webdrop-control-v1`, `webdrop-file-v1`)
  so control messages never sit behind file bytes, **256 KiB** chunks, a manifest
  first, ACK/cancel/retry, and a 500 MB per-session cap in each direction
  (`js/services/data-channel-transfer-protocol.js`).

### 14. IndexedDB & StreamSaver (the receive ladder)

- **One line:** store incoming chunks in a browser database, then stream them to
  a download only when the user asks.
- **Analogy:** a parcel locker. Packages accumulate safely (IndexedDB); you
  collect them on demand (Save → StreamSaver) rather than having them dumped on
  your doorstep mid-delivery.
- **How it works:** IndexedDB is an async key-value store that can hold large
  binary chunks on disk. StreamSaver uses a service worker to stream bytes into
  the browser's native download pipeline without buffering the whole file in RAM.
- **In WebDrop:** `js/storage/storage-client.js` defers chunks to IndexedDB,
  exports via StreamSaver on Save, and falls back to a capped in-memory Blob on
  iOS Safari. Receiving never auto-starts a download.

### 15. Web Audio API & ultrasonic chirps

- **One line:** synthesize and analyze sound in the browser; WebDrop chirps just
  above human hearing.
- **Analogy:** a dog whistle plus a very attentive ear that checks "did I hear
  *exactly that* whistle, and how loud vs. the background?"
- **How it works:** an oscillator emits a coded sweep; the mic is recorded with
  echo-cancellation / noise-suppression / auto-gain **off**, then the recording
  is **correlated** against the expected chirp shape and checked for an **energy
  margin** above background.
- **In WebDrop:** `js/services/acoustic-proximity.js`,
  `DEFAULT_CHIRP = { durationMs: 112, startFrequencyHz: 18600, endFrequencyHz:
  19400, gain: 0.24 }`. Inaudibility/reliability vary by device — calibrate on
  real phones.

### 16. DeviceMotion (bump & tilt)

- **One line:** read the accelerometer to detect a deliberate bump and a tilt.
- **Analogy:** a fist-bump handshake — a sharp jolt both phones feel at nearly
  the same moment.
- **How it works:** `DeviceMotionEvent` reports acceleration; a spike means a
  bump, sustained gravity direction gives tilt angles. iOS requires an explicit
  permission call from a user gesture.
- **In WebDrop:** `js/services/motion-proximity.js` — bump when linear
  acceleration ≥ 10 or gravity-vector change ≥ 3.5; tilt when |beta| or |gamma|
  > 30°.

### 17. Multiple access, Aloha, and reservation TDMA

- **One line:** rules for letting many devices share one channel (here, sound)
  without talking over each other.
- **Analogy:** a meeting. **Aloha** = everyone speaks whenever they like and
  repeats if two collide. **Slotted Aloha** = speak only at the start of fixed
  time slots (fewer collisions, still random). **Reservation TDMA** = the chair
  assigns each person a numbered turn in advance — no collisions.
- **How it works:** TDMA (Time Division Multiple Access) splits time into slots;
  "reservation" means a coordinator hands out slots *before* anyone transmits.
  It's **Aloha-family** because Aloha is the ancestor of all shared-channel
  random/slotted schemes — WebDrop just upgrades from "gamble on a slot" to
  "reserved slot" because it already has a coordinating server.
- **In WebDrop:** the signaling server assigns each cohort member a slot +
  signature; everyone records the whole ceremony, emits only in their slot, and
  decodes all peers afterward.

### 18. QR codes (`BarcodeDetector` / `jsQR`)

- **One line:** a scannable image carrying a short one-time pairing token.
- **Analogy:** showing a numbered ticket at a counter; the counter checks it's
  genuine, unused, and unexpired.
- **How it works:** one device renders a token as a QR; the other scans it
  (native `BarcodeDetector`, `jsQR` fallback); the server validates issuer,
  scanner, expiry, and replay.
- **In WebDrop:** the universal fallback when mic/motion/audio fail
  (`js/ui/dynamic-island.js`, `qr-token-provider.js`).

### 19. Permissions model (mic / motion / camera)

- **One line:** powerful sensors need explicit, gesture-triggered user consent,
  and that consent is reused within a page load.
- **Analogy:** being buzzed into a building once and then moving freely until you
  leave — but after you exit (reload), you must be buzzed in again.
- **How it works:** browsers gate `getUserMedia` (mic), `DeviceMotionEvent.
  requestPermission` (iOS motion), and camera behind user gestures. Once granted,
  the page can reuse the stream; iOS revalidates motion after a reload.
- **In WebDrop:** requested only on Connect/Scan; the mic stream is kept warm and
  reused (see Q&A vii).

### 20. The WSS upgrade handshake (on the wire)

- **One line:** a WebSocket is born as an ordinary HTTP request that asks to be
  "upgraded" into a persistent two-way socket.
- **Analogy:** you start with a normal letter (HTTP) that says "let's switch to a
  phone call"; once both sides agree, you stop writing letters and just talk.
- **How it works:** the browser sends `GET /ws` with `Upgrade: websocket`,
  `Connection: Upgrade`, and a random `Sec-WebSocket-Key`. The server replies
  `101 Switching Protocols` with a `Sec-WebSocket-Accept` derived from that key
  (proof it understood the protocol). After the 101, the TCP connection is no
  longer HTTP — it carries WebSocket frames both ways. With `wss://`, TLS wraps
  the whole thing and an edge proxy usually terminates that TLS.
- **In WebDrop:** nginx receives the `wss://…/ws` upgrade, terminates TLS, and
  forwards the upgraded socket to Node on `127.0.0.1:8080`; the first frame the
  app must send is `client:hello`.

### 21. SDP anatomy (what's actually in the blob)

- **One line:** SDP is a small plain-text description of media/data, codecs,
  network info, and security fingerprints.
- **Analogy:** a meeting agenda + business card: "here's what I can discuss, the
  languages I speak, where to reach me, and how you'll know it's really me."
- **How it works:** lines like `m=application … webrtc-datachannel` declare a
  data channel; `a=ice-ufrag`/`a=ice-pwd` carry ICE credentials; `a=fingerprint`
  carries the DTLS certificate fingerprint used to authenticate the encrypted
  channel. The *offer* lists what the caller wants; the *answer* echoes the
  agreed subset.
- **In WebDrop:** the offer/answer are opaque to the app — it just relays them as
  `rtc:signal` — but the `a=fingerprint` line is what makes the later DTLS
  channel verifiably end-to-end between the two intended browsers.

### 22. Correlation and energy margin (how a chirp is *detected*)

- **One line:** detection is not "was it loud?" but "did the recording contain
  *this specific* coded sweep, clearly above the background?"
- **Analogy:** picking your friend's whistle out of a noisy playground — you match
  the *tune* (correlation), and you check it was clearly louder than the crowd
  (energy margin).
- **How it works:** **correlation** slides the expected chirp template over the
  recording and measures how well the shapes line up (1.0 = perfect match, 0 =
  unrelated). **Energy margin** compares the energy inside the chirp's frequency
  band against nearby background, in decibels. WebDrop accepts a detection on a
  ladder: strong correlation alone, or weaker correlation backed by a healthy dB
  margin (see the proximity doc for the exact thresholds: 0.30 / 0.20 / 0.16 +
  4.5 dB / 8 dB).
- **In WebDrop:** `js/services/acoustic-proximity.js` records with echo
  cancellation / noise suppression / auto-gain **off** so the high-frequency
  energy survives, then runs these checks per slot and over an expanded window to
  tolerate mobile audio timing drift.

### 23. Nyquist and sample-rate band safety

- **One line:** a microphone sampling at rate *R* can only faithfully represent
  frequencies up to *R/2* (the Nyquist limit).
- **Analogy:** a camera that takes 30 photos a second can't capture something
  that flickers 100 times a second — it aliases into nonsense.
- **How it works:** if a phone samples at 44.1 kHz, its Nyquist limit is ~22 kHz;
  at 48 kHz it is 24 kHz. To stay safely below that (and below anti-alias
  filters), WebDrop's server keeps the shared ultrasonic band under roughly
  `sampleRate × 0.45 − 100 Hz` and requires at least 420 Hz of usable bandwidth.
- **In WebDrop:** the server inspects every participant's reported sample rate and
  picks a shared band (default 18.6–19.4 kHz) that the *lowest* device can still
  hear, so no phone in the cohort is asked to detect a tone it physically can't
  sample.

### 24. Reciprocal signatures and the winner margin (anti-mismatch)

- **One line:** a pair is only trusted when *each* device both played its own
  coded signature and clearly heard the *other's* — mutually.
- **Analogy:** a secret handshake only counts if both people do their half *and*
  recognise the other's half; recognising a stranger's handshake doesn't count.
- **How it works:** for A↔B, A must report its own signature and report hearing
  B's, and B must do the same for A, each above a detection threshold. The
  **winner margin** then requires the best-matching signature to be sufficiently
  clearer than the runner-up so a third nearby phone can't be confused for the
  partner. The guard **fails safe**: a missing/non-finite margin *fails* rather
  than passes (`ACOUSTIC_WINNER_MARGIN = 0.04`).
- **In WebDrop:** this reciprocity, not "who is nearby", is the primary
  disambiguator that keeps A↔B and C↔D from cross-pairing (see Q ii).

### 25. Reservation TDMA — a worked schedule

- **One line:** the server hands each device a numbered turn so their chirps
  never overlap.
- **Analogy:** a roll-call: the teacher says "A speaks in second 1, B in second
  2, C in second 3"; everyone listens the whole time and only speaks on cue.
- **How it works:** the 3,600 ms ceremony window is divided into slots of at least
  ~600 ms (a ~520 ms coded chirp + ~80 ms guard). Each cohort member emits only in
  its own slot and records the entire window, decoding all peers afterward:

```text
Window:  |<-------------------- 3,600 ms -------------------->|
Slot 1:  [ A emits | B,C,D listen ]
Slot 2:               [ B emits | A,C,D listen ]
Slot 3:                            [ C emits | A,B,D listen ]
Slot 4:                                         [ D emits | ... ]
```

- **In WebDrop:** `floor(3600 / 600) = 6` slots fit, which is exactly why the
  per-cohort cap is **6** (and is *clamped* to that ceiling). Bigger cohorts need
  a longer window, not just a bigger number.

### 26. Concurrent bounded cohorts (the capacity model)

- **One line:** instead of one room of six, run many rooms of six at once, with a
  global headcount cap.
- **Analogy:** a building with many small meeting rooms. Each room holds a clean
  roll-call; the lobby just won't let more than the building's fire limit inside.
- **How it works:** the hub keeps a *set* of open cohorts. A new joiner slots into
  an open cohort with room, or opens a fresh one; when a cohort fills (6) it
  closes and starts its ceremony. A global cap
  `MAX_TOTAL_PROXIMITY_PARTICIPANTS = 100` bounds everyone; beyond it joins fail
  with `capacity_reached`. So **100 ÷ 6 ≈ 17 cohorts ≈ up to ~50 pairs**.
- **Honest caveat (physical-device dependent):** the software *allows* ~50
  co-located pairs, but ~50 pairs sharing one ~800 Hz band in one room is
  acoustically crowded; real reliability must be measured on hardware. The path to
  10,000 is config + Redis/shared presence + sticky multi-node WS + load testing.

### 27. Tuning knobs (the dials, and what they trade)

- **One line:** capacity, cohort size, and contention are governed by a small set
  of server env knobs (`azure cloud server/.env.example`).
- **How they trade off:**

| Knob | Default | Raising it… |
| --- | ---: | --- |
| `MAX_TOTAL_PROXIMITY_PARTICIPANTS` | 100 | allows more concurrent participants (toward 10k) — needs shared state + multi-node to mean anything |
| `MAX_PROXIMITY_SESSION_CLIENTS` | 6 | only helps if `PROXIMITY_SESSION_DURATION_MS` also grows (it is clamped to the slot-floor ceiling) |
| `PROXIMITY_SESSION_DURATION_MS` | 3,600 ms | adds slots (longer window) so bigger cohorts become legal — at the cost of a slower ceremony |
| `ACOUSTIC_SESSION_STAGGER_MS` | 600 ms | spreads simultaneous cohort starts so they don't all chirp at once |
| `ACOUSTIC_MAX_CONCURRENT_SUBBANDS` | 4 | pins cohorts to different frequency lanes — a no-op until the band is widened past ~420 Hz |

- **In WebDrop:** these are documented in the backend README and verified by
  `tests/signaling-hub-proximity-scaling.test.mjs` (e.g. a 4,800 ms window raises
  the ceiling to 8). Mark band/contention claims as physical-device dependent.

---

## Part 2 — Multi-device pairing Q&A

These answers reflect the **current code**. Key files:
`azure cloud server/src/signaling-hub.js`, `proximity-score.js`;
`js/services/proximity-engine.js`, `acoustic-proximity.js`,
`motion-proximity.js`; `js/core/controller.js`.

### Q(i) — Does WebDrop work with multiple people at once? What's the scheme?

**Yes.** Pairing is a **server-arbitrated reservation-TDMA** ceremony — an
Aloha-family scheme, but reservation-based rather than contention-based. The
server collects nearby anonymous devices into a **cohort**, assigns each a unique
**time slot** and **coded signature** in a shared ultrasonic band, and starts a
synchronized ceremony. Everyone records the whole window, emits only in their own
slot, and decodes all peers afterward
(`exchangeSignatureChirps` in `proximity-engine.js`; scheduling in
`startProximitySession` in `signaling-hub.js`). The server then matches devices
into pairs (next question). Many cohorts can run **concurrently** (Q viii).

### Q(ii) — Four iPhones: A+B want to pair, C+D want to pair. How does the server avoid pairing A+C?

The primary disambiguator is **reciprocal ultrasonic signatures**, not "who's
nearby". In `tryMatchProximitySession` (`signaling-hub.js`) a pair (X, Y) is only
matched when **all** of these hold:

1. **Reciprocal signatures (primary).** X reports *its own* assigned signature
   and reports **hearing Y's** signature, and Y reports *its own* and **hearing
   X's** — both with a usable correlation/energy detection
   (`hasReciprocalAcousticEvidence`). A+C never match because A heard B's
   signature, not C's.
2. **Bump-time gate / tie-break.** The two devices' bump timestamps must be
   within `PROXIMITY_SESSION_MATCH_SLOP_MS` (**4,000 ms**); among valid candidate
   pairs the server prefers the **smallest** bump-time delta as a tie-break
   (`delta > matchSlopMs || !reciprocal → skip`; "`if (!best || delta <
   best.delta)`").
3. **Mandatory evidence + unambiguous winner.** Each side needs ultrasound,
   bump, and tilt evidence and a sufficient **winner margin**
   (`ACOUSTIC_WINNER_MARGIN = 0.04`, fail-safe).

So the intended result is `A↔B` and `C↔D`, driven by *who heard whose coded
chirp*. **Tilt is presence-only** — it must be present (`physicalEvidence.tilt`),
but it is not used to decide *which* device pairs with which.

### Q(iii) — What if B taps Connect a bit slower than C?

It depends on whether B taps within the cohort's **join window**:

- A cohort opens with a join window of `PROXIMITY_SESSION_JOIN_WINDOW_MS`
  (**1,800 ms**). If only one device is present when it expires, the server grants
  **one extension** (another 1,800 ms) before failing — so a late second device
  has up to ~3,600 ms to arrive (`openProximitySession` / `startProximitySession`).
- If B taps within that window, B joins the **same** open cohort as the others.
- If B taps **after** that cohort has already started its ceremony, B is placed
  into a **different** concurrent cohort (the open one with room, or a new one).
- **Fail-safe:** a device that ends up alone gets `proximity:session:failed`
  `reason: "no_nearby_partner"` (it can retry or use QR). Nothing pairs by
  accident.

In short: small timing differences (within ~1.8–3.6 s) keep everyone in one
cohort; larger gaps split them into separate concurrent cohorts, and the matcher
still only connects reciprocal pairs.

### Q(iv) — What if all four tap at (nearly) the same time?

They all land in **one cohort** (the per-cohort cap defaults to 6, so 4 fit). The
server assigns four slots and four signatures; each phone emits in its slot and
decodes the other three. The matcher then forms the **two reciprocal pairs**
(A↔B and C↔D) based on which coded signatures each phone actually heard, gated by
the ≤4 s bump window. Simultaneous taps are the *easy* case for reservation TDMA,
because slots are pre-assigned and never collide.

### Q(v) — Is exact bump timing used to decide who matches whom?

**No.** Exact bump timing is **not** the identity matcher. It is:

- a **gate**: the two bump timestamps must be within 4,000 ms
  (`PROXIMITY_SESSION_MATCH_SLOP_MS`), and the ceremony timing must be valid
  (`ceremonyTimingValid`), and
- a **tie-break**: among otherwise-valid candidate pairs, the smallest bump-time
  delta wins.

The actual "these two belong together" decision is the **reciprocal ultrasonic
signature** exchange. You do **not** need millisecond-perfect synchronized bumps;
you need a roughly co-timed bump (within ~4 s) plus mutually-heard coded chirps.

### Q(vi) — A tester saw ~70% success, and orientation (mic/"head" toward the speaker) seemed to matter. Why?

Two honest points:

1. **The code has no directionality/orientation model.** Nothing in
   `acoustic-proximity.js` or the server scoring reasons about which way a phone
   faces. Detection is based on **correlation** and **energy margin** thresholds
   only; there is no "speaker-to-mic angle" term.
2. **The physics still makes orientation matter.** Ultrasound (~18.6–19.4 kHz) is
   highly **directional** and attenuates quickly; phone speakers beam it, and
   mics are more sensitive on-axis. So pointing the receiving mic toward the
   emitting speaker plausibly raises the received energy/correlation and pushes a
   borderline detection over the threshold — and away-facing or muffled phones
   can dip below it. That is consistent with a ~70% success rate that improves
   with orientation.

**Conclusion:** the ~70% and the orientation effect are **empirical,
physical-device behaviour**, not something the current software encodes or
guarantees. Improving it (e.g. higher gain, wider/again-calibrated band,
threshold tuning, or longer slots) requires **real two-device measurements** —
see [`webdrop-proximity-scoring-and-tdma.md`](webdrop-proximity-scoring-and-tdma.md)
for the thresholds you'd tune.

### Q(vii) — Are permissions asked every time? (mic/motion)

**No — they are requested once per page load and reused.**

- **De-duplication:** `ensureProximityPermissions` in `controller.js` caches a
  single in-flight `permissionRequestPromise` and persists results in
  `storedPermissions`, so repeated ceremonies in the same page load don't
  re-prompt for an already-granted (or already-denied) sensor.
- **Mic stream kept warm:** `AcousticProximitySensor.requestMicrophonePermission`
  returns the existing stream if `this.stream?.active`, and the controller stops
  capture with `stopAcousticCapture({ releaseStream: false })` — the granted mic
  stream stays open between ceremonies, avoiding repeated `getUserMedia()` calls.
- **Motion re-validated after reload (iOS):** iOS requires native motion access
  to be re-confirmed from a fresh user gesture after a page reload.
  `MotionProximitySensor.restorePermission` resets a previously-granted state back
  to `"unknown"` on load (keeping only `denied`/`unsupported`), so motion is
  re-validated only **after a reload**, not on every ceremony within a session.

### Q(viii) — How does the new concurrent-cohort capacity model work (100 now → 10,000 goal)?

WebDrop no longer keeps a single global pairing session. The hub tracks a set of
open cohorts (`openProximitySessionIds`, commit `25acf17`):

- **Global cap:** `MAX_TOTAL_PROXIMITY_PARTICIPANTS` (default **100**) bounds the
  total participants across all concurrent cohorts. A join beyond it is rejected
  cleanly with `proximity:session:failed` `reason: "capacity_reached"`
  (verified in `tests/signaling-hub-proximity-scaling.test.mjs`).
- **Per-cohort cap:** `MAX_PROXIMITY_SESSION_CLIENTS` (default 6) is **clamped**
  to a slot-floor ceiling. A coded chirp needs ~520 ms + an 80 ms guard (~600 ms
  slot floor), and the 3,600 ms ceremony window fits ~6 slots, so the cohort can
  never schedule sub-floor slots. Bigger cohorts require a longer window
  (`PROXIMITY_SESSION_DURATION_MS`), not just a bigger number.
- **De-confliction:** concurrent cohorts that fill simultaneously are spread
  across start-time phases (`ACOUSTIC_SESSION_STAGGER_MS`) and, when the band is
  wide enough, pinned to different sub-bands
  (`ACOUSTIC_MAX_CONCURRENT_SUBBANDS`). The assigned lane is reported via the
  additive `acousticBandIndex` / `acousticBandCount` fields on
  `proximity:session:start`.

So **100 participants ≈ 17 concurrent 6-person cohorts ≈ up to ~50 pairs**.

**Honest caveat:** the software *allows* ~50 co-located pairs, but ~50 pairs
sharing one ~800 Hz ultrasonic band in one physical room is acoustically
contended; whether they reliably hear each other is a **physical-device
question** to be measured, not a software guarantee. The path to **10,000** is a
config bump (`MAX_TOTAL_PROXIMITY_PARTICIPANTS`) **plus** shared presence/state
(Redis), multi-node sticky/session-routed WebSocket balancing, and staged load
testing — outlined in [`../azure cloud server/README.md`](../azure%20cloud%20server/README.md).

### Q(ix) — Two groups are pairing far apart (different rooms / opposite ends of a hall). Do they interfere?

**No, for two independent reasons — one logical, one physical.**

1. **Logical isolation (guaranteed by the code).** Pairing identity is decided by
   **reciprocal coded signatures**, not by "who is nearby" or by raw loudness.
   For group 1 (A,B) to pair, A must hear *B's* assigned signature and B must hear
   *A's*; group 2's devices were issued *different* signatures (and likely placed
   in a *different cohort* entirely). Even if a far-off chirp leaked across the
   room, it would carry the wrong signature and fail the reciprocity + winner-
   margin checks, so it can never silently cross-pair. This is enforced
   regardless of distance.
2. **Physical isolation (helps, but is hardware-dependent).** Ultrasound at
   ~18.6–19.4 kHz is **highly directional** and **attenuates quickly** with
   distance, so a group across the room is usually far below the detection
   threshold anyway. Concurrent cohorts are also **start-staggered**
   (`ACOUSTIC_SESSION_STAGGER_MS`) and can be pinned to different **sub-bands**
   when the band is wide enough, further reducing overlap.

So distant pairs don't interfere because (1) they're cryptographically/coded-ly
distinct and reciprocity-gated, and (2) ultrasound doesn't travel far. The only
genuinely hard case is **many pairs packed into one small room on one band** —
that contention is the physical-device question above, not a cross-room problem.

### Q(x) — What is the absolute maximum, and what does a user see at the cap?

- The hard ceiling today is `MAX_TOTAL_PROXIMITY_PARTICIPANTS` (**100**)
  *simultaneous in-ceremony participants* across all cohorts — roughly **50
  pairs**. This is a single-node, in-memory bound.
- A device that taps Connect when 100 are already mid-ceremony gets a clean
  `proximity:session:failed` with `reason: "capacity_reached"` **before** any
  cohort is mutated (verified in
  `tests/signaling-hub-proximity-scaling.test.mjs`). The user can simply retry a
  moment later, or use QR. Nothing pairs incorrectly and no in-flight cohort is
  disturbed.
- 100 is not a product limit, it is a *safe default*. Reaching **10,000** is not
  one number change: it needs shared presence/state (Redis), multiple signaling
  nodes with sticky/session-routed WebSocket balancing, and staged load testing —
  see [`../azure cloud server/README.md`](../azure%20cloud%20server/README.md).

### Q(xi) — Which knobs would I turn to support bigger cohorts or more capacity?

Use the smallest change that matches the goal (all in `azure cloud server/.env`):

- **More total people (not bigger rooms):** raise
  `MAX_TOTAL_PROXIMITY_PARTICIPANTS`. On one node this is just a memory/CPU bet;
  past a point you must add Redis + multi-node + sticky WS, or the number is
  meaningless.
- **Bigger single cohorts (more than 6 in one acoustic room):** you must raise
  `PROXIMITY_SESSION_DURATION_MS` *first*, because `MAX_PROXIMITY_SESSION_CLIENTS`
  is **clamped** to `floor(window / ~600 ms)`. A 4,800 ms window ⇒ ceiling 8.
  Bigger cohorts also mean a longer, more contended ceremony.
- **Less cross-cohort contention:** raise `ACOUSTIC_SESSION_STAGGER_MS` /
  `ACOUSTIC_SESSION_STAGGER_PHASES`, and widen the band
  (`ACOUSTIC_BAND_START_HZ`/`ACOUSTIC_BAND_END_HZ`) so
  `ACOUSTIC_MAX_CONCURRENT_SUBBANDS` can actually split lanes (it's a no-op until
  the band exceeds ~420 Hz of usable bandwidth).

**Always re-measure on real phones after turning any acoustic knob** — band,
gain, slot length, and threshold effects are physical-device dependent and are
not guaranteed by the scheduler. The exact thresholds you'd tune are in
[`webdrop-proximity-scoring-and-tdma.md`](webdrop-proximity-scoring-and-tdma.md).

---

## Where to go next

- Implementation detail (how the app is wired):
  [`webdrop-app-documentation.md`](webdrop-app-documentation.md).
- Exact proximity scoring + TDMA schedule:
  [`webdrop-proximity-scoring-and-tdma.md`](webdrop-proximity-scoring-and-tdma.md).
- Architecture invariants + canonical diagram:
  [`architecture.md`](architecture.md).
- Backend protocol, capacity knobs, deployment:
  [`../azure cloud server/README.md`](../azure%20cloud%20server/README.md).

# Mermaid-Free Production Documentation Diagrams

Mermaid often renders badly depending on the viewer, especially with:

- nested subgraphs
- HTML labels like `<br/>`
- long text inside nodes
- mobile Markdown renderers
- some documentation tools that only support a subset of Mermaid

For production docs, use **ASCII diagrams**, **SVG**, or **draw.io/Figma diagrams** instead. Below are clean replacement diagrams that render correctly anywhere.

---

# 1. System Architecture Diagram — ASCII Version

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         Vercel Static Hosting                        │
│                                                                      │
│      HTML / CSS / Vanilla JS / Web Workers / Service Worker          │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTPS static asset delivery
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           Client Browser A                           │
│                                                                      │
│  ┌────────────────┐   ┌────────────────┐   ┌─────────────────────┐  │
│  │ Capability     │   │ Proximity      │   │ Storage / Export    │  │
│  │ Detection      │   │ Engine         │   │ Engine              │  │
│  └────────────────┘   └────────────────┘   └─────────────────────┘  │
│                                                                      │
│                     ┌────────────────────────┐                       │
│                     │ WebRTC PeerConnection  │                       │
│                     │ RTCDataChannel         │                       │
│                     └────────────────────────┘                       │
└──────────────────────────────────────────────────────────────────────┘
            │                                             ▲
            │ WSS: signaling, invites, metadata, ICE       │
            ▼                                             │
┌──────────────────────────────────────────────────────────────────────┐
│                       AWS Signaling Infrastructure                    │
│                                                                      │
│  ┌──────────────────┐      ┌─────────────────────────────────────┐   │
│  │ NGINX Reverse    │─────▶│ Node.js WebSocket Signaling Server  │   │
│  │ Proxy            │      │                                     │   │
│  └──────────────────┘      │ - Presence                          │   │
│                            │ - Pairing sessions                  │   │
│                            │ - Invite routing                    │   │
│                            │ - ICE relay                         │   │
│                            │ - Score metadata                    │   │
│                            └─────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
            ▲                                             │
            │ WSS: signaling, invites, metadata, ICE       │
            │                                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           Client Browser B                           │
│                                                                      │
│  ┌────────────────┐   ┌────────────────┐   ┌─────────────────────┐  │
│  │ Capability     │   │ Proximity      │   │ Storage / Export    │  │
│  │ Detection      │   │ Engine         │   │ Engine              │  │
│  └────────────────┘   └────────────────┘   └─────────────────────┘  │
│                                                                      │
│                     ┌────────────────────────┐                       │
│                     │ WebRTC PeerConnection  │                       │
│                     │ RTCDataChannel         │                       │
│                     └────────────────────────┘                       │
└──────────────────────────────────────────────────────────────────────┘


                    Encrypted WebRTC DataChannel Path
┌───────────────────────────┐                    ┌───────────────────────────┐
│     Client Browser A      │◀──────────────────▶│     Client Browser B      │
│     File chunks           │                    │     File chunks           │
└───────────────────────────┘                    └───────────────────────────┘
              │                                                │
              │ If direct P2P fails                            │
              ▼                                                ▼
        ┌──────────────────────────────────────────────────────────┐
        │                    TURN Infrastructure                    │
        │                                                          │
        │        coturn / Managed TURN / Cheap Egress Relay        │
        │                                                          │
        │        Used only when direct WebRTC path fails           │
        └──────────────────────────────────────────────────────────┘
```

---

# 2. Presence Ring UI Diagram — ASCII Version

```text
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                         RING 4: ONLINE LOBBY                       │
│               WebSocket-connected users only                        │
│                                                                     │
│    ┌───────────────────────────────────────────────────────────┐    │
│    │                                                           │    │
│    │              RING 3: INVITATION PIPELINE                 │    │
│    │              Invite sent / receiver accepted              │    │
│    │                                                           │    │
│    │     ┌───────────────────────────────────────────────┐     │    │
│    │     │                                               │     │    │
│    │     │         RING 2: ACTIVE VERIFICATION           │     │    │
│    │     │         QR / chirp / bump / tilt running       │     │    │
│    │     │                                               │     │    │
│    │     │    ┌─────────────────────────────────────┐    │     │    │
│    │     │    │                                     │    │     │    │
│    │     │    │     RING 1: VALIDATED PEERS         │    │     │    │
│    │     │    │     Proximity score passed          │    │     │    │
│    │     │    │                                     │    │     │    │
│    │     │    │       ┌─────────────────────┐       │    │     │    │
│    │     │    │       │       CENTER        │       │    │     │    │
│    │     │    │       │ Active WebRTC       │       │    │     │    │
│    │     │    │       │ Transfer Session    │       │    │     │    │
│    │     │    │       └─────────────────────┘       │    │     │    │
│    │     │    │                                     │    │     │    │
│    │     │    └─────────────────────────────────────┘    │     │    │
│    │     │                                               │     │    │
│    │     └───────────────────────────────────────────────┘     │    │
│    │                                                           │    │
│    └───────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Correct UI meaning

```text
Ring 4  = Available online users
Ring 3  = Intent established
Ring 2  = Verification running
Ring 1  = Nearby verified
Center  = Connected and transferring
```

---

# 3. Full Runtime Flow Diagram

```text
┌─────────────────────┐
│ User opens web app  │
└──────────┬──────────┘
           │
           ▼
┌────────────────────────────┐
│ Evaluate client capability │
│                            │
│ - iOS / Android hint       │
│ - Motion API               │
│ - Mic / camera             │
│ - OPFS / IndexedDB         │
│ - WebRTC support           │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│ Connect to WSS signaling   │
│ server                     │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│ Show online lobby ring     │
│                            │
│ These users are online,    │
│ not yet verified nearby.   │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│ User selects target peer   │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│ Receiver accepts invite    │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│ Select verification mode   │
└──────────┬─────────────────┘
           │
           ├───────────────────────────────┐
           │                               │
           ▼                               ▼
┌────────────────────────────┐   ┌────────────────────────────┐
│ QR verification             │   │ Sound + motion verification│
│                             │   │                            │
│ - iPhone ↔ iPhone default   │   │ - Android ↔ iPhone         │
│ - universal fallback        │   │ - Android ↔ Android        │
└──────────┬─────────────────┘   └──────────┬─────────────────┘
           │                                │
           └──────────────┬─────────────────┘
                          ▼
              ┌──────────────────────┐
              │ Server evaluates     │
              │ proximity score      │
              └──────────┬───────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
┌──────────────────────┐      ┌──────────────────────────┐
│ Score failed         │      │ Score passed             │
│                      │      │                          │
│ Retry or QR fallback │      │ Start WebRTC preflight   │
└──────────────────────┘      └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ Classify connection path │
                              │                          │
                              │ - Direct                 │
                              │ - Relay                  │
                              │ - Failed                 │
                              └──────────┬───────────────┘
                                         │
             ┌───────────────────────────┼───────────────────────────┐
             │                           │                           │
             ▼                           ▼                           ▼
┌────────────────────────┐   ┌────────────────────────┐   ┌──────────────────────┐
│ Direct mode            │   │ TURN relay mode         │   │ WebRTC failed        │
│                        │   │                        │   │                      │
│ Large files allowed,   │   │ File-size capped,      │   │ Retry / fallback     │
│ storage permitting     │   │ bandwidth throttled    │   │                      │
└──────────┬─────────────┘   └──────────┬─────────────┘   └──────────────────────┘
           │                            │
           └──────────────┬─────────────┘
                          ▼
              ┌──────────────────────┐
              │ Receiver storage     │
              │ capability check     │
              └──────────┬───────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ▼                             ▼
┌──────────────────────┐      ┌──────────────────────────┐
│ Reject file safely   │      │ Start chunked transfer   │
│                      │      │                          │
│ Explain reason       │      │ WebRTC DataChannel       │
└──────────────────────┘      └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ Write chunks to storage  │
                              │                          │
                              │ 1. OPFS                  │
                              │ 2. IndexedDB             │
                              │ 3. Memory, small only    │
                              └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ Verify incremental hash  │
                              └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ Export / save / share    │
                              └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ Transfer complete        │
                              └──────────────────────────┘
```

---

# 4. Signaling Sequence Diagram — ASCII Version

```text
Client A                         Signaling Server                         Client B
   │                                    │                                    │
   │── ClientHello(capabilities) ──────▶│                                    │
   │                                    │◀────── ClientHello(capabilities) ──│
   │                                    │                                    │
   │◀──────────── OnlinePeerList ───────│──────────── OnlinePeerList ───────▶│
   │                                    │                                    │
   │── Invite(targetId) ───────────────▶│                                    │
   │                                    │── Invite(sourceId) ───────────────▶│
   │                                    │                                    │
   │                                    │◀──── InviteAccepted(pairingId) ───│
   │◀──── SessionProvisioned ───────────│── SessionProvisioned ────────────▶│
   │                                    │                                    │
   │          ┌──────────────────────────────────────────────────┐          │
   │          │        Proximity Verification Ceremony            │          │
   │          │        QR / chirp / bump / tilt                   │          │
   │          └──────────────────────────────────────────────────┘          │
   │                                    │                                    │
   │── ProximityTelemetry(metricsA) ───▶│                                    │
   │                                    │◀── ProximityTelemetry(metricsB) ───│
   │                                    │                                    │
   │                                    │ Evaluate score                     │
   │                                    │                                    │
   │◀──── MatchEvaluation(pass/fail) ───│── MatchEvaluation(pass/fail) ────▶│
   │                                    │                                    │
   │          If passed: start WebRTC signaling                             │
   │                                    │                                    │
   │── RTCOffer ───────────────────────▶│── RTCOffer ──────────────────────▶│
   │                                    │                                    │
   │◀── RTCAnswer ──────────────────────│◀── RTCAnswer ─────────────────────│
   │                                    │                                    │
   │── ICECandidate ───────────────────▶│── ICECandidate ──────────────────▶│
   │◀── ICECandidate ───────────────────│◀── ICECandidate ──────────────────│
   │                                    │                                    │
   │          ┌──────────────────────────────────────────────────┐          │
   │          │       Encrypted WebRTC DataChannel opens          │          │
   │          └──────────────────────────────────────────────────┘          │
   │                                    │                                    │
```

---

# 5. WebRTC Preflight and Path Classification

```text
┌──────────────────────────────┐
│ Start WebRTC preflight       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Create RTCPeerConnection     │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Exchange offer / answer      │
│ through WebSocket signaling  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Exchange ICE candidates      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Open control DataChannel     │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Run ping / pong diagnostic   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Read selected ICE candidate  │
│ pair from getStats()         │
└──────────────┬───────────────┘
               │
               ▼
        ┌──────────────┐
        │ Path type?   │
        └──────┬───────┘
               │
    ┌──────────┼───────────┐
    │          │           │
    ▼          ▼           ▼
┌────────┐ ┌──────────┐ ┌────────────┐
│ Direct │ │ TURN     │ │ Failed     │
│ P2P    │ │ Relay    │ │ WebRTC     │
└───┬────┘ └────┬─────┘ └─────┬──────┘
    │           │             │
    ▼           ▼             ▼
┌────────────┐ ┌────────────┐ ┌────────────────┐
│ Large file │ │ Cap file   │ │ Retry / QR /   │
│ allowed    │ │ size       │ │ show failure   │
└────────────┘ └────────────┘ └────────────────┘
```

---

# 6. Storage Pipeline Diagram

```text
Sender Device                                      Receiver Device
─────────────                                      ───────────────

┌──────────────┐
│ Source File  │
│ Blob Handle  │
└──────┬───────┘
       │
       │ Blob.slice(offset, offset + chunkSize)
       ▼
┌──────────────┐
│ 64 KB Chunk  │
│ ArrayBuffer  │
└──────┬───────┘
       │
       │ RTCDataChannel.send()
       ▼
┌──────────────────────────┐
│ Encrypted WebRTC Frame   │
│ DTLS / SCTP              │
└──────────┬───────────────┘
           │
           │ Network path:
           │ - Direct P2P
           │ - TURN relay fallback
           ▼
┌──────────────────────────┐
│ Receiver DataChannel     │
│ message event            │
└──────────┬───────────────┘
           │
           │ Transfer ArrayBuffer to Worker
           ▼
┌──────────────────────────┐
│ Storage Worker           │
│                          │
│ - write chunk            │
│ - update manifest        │
│ - update hash state      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Storage Driver Selector  │
└──────────┬───────────────┘
           │
    ┌──────┼───────────┐
    │      │           │
    ▼      ▼           ▼
┌──────┐ ┌──────────┐ ┌────────────┐
│ OPFS │ │ IndexedDB│ │ Memory     │
│ best │ │ fallback │ │ small only │
└──────┘ └──────────┘ └────────────┘
```

---

# 7. Storage Selection Diagram

```text
┌──────────────────────────────┐
│ Incoming file metadata       │
│                              │
│ - file name                  │
│ - file size                  │
│ - MIME type                  │
│ - expected hash              │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Is file allowed by transport?│
│                              │
│ Direct: storage-limited      │
│ Relay: capped, e.g. 100 MB   │
└──────────────┬───────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌──────────────┐  ┌────────────────────┐
│ Rejected     │  │ Continue            │
│ too large    │  │                    │
└──────────────┘  └──────────┬─────────┘
                              │
                              ▼
                   ┌───────────────────┐
                   │ OPFS available?   │
                   └─────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌──────────────────┐          ┌───────────────────┐
     │ Use OPFS Worker  │          │ IndexedDB exists? │
     │ Writer           │          └─────────┬─────────┘
     └──────────────────┘                    │
                              ┌──────────────┴──────────────┐
                              │                             │
                              ▼                             ▼
                    ┌──────────────────┐          ┌──────────────────┐
                    │ Use IndexedDB    │          │ Small enough for │
                    │ Chunk Store      │          │ memory mode?     │
                    └──────────────────┘          └─────────┬────────┘
                                                            │
                                             ┌──────────────┴──────────────┐
                                             │                             │
                                             ▼                             ▼
                                   ┌──────────────────┐          ┌──────────────────┐
                                   │ Use Memory Store │          │ Cannot safely    │
                                   │ small files only │          │ receive file     │
                                   └──────────────────┘          └──────────────────┘
```

---

# 8. Transfer State Machine — ASCII Version

```text
[App Loaded]
     │
     ▼
[Capabilities Detected]
     │
     ▼
[WebSocket Connected]
     │
     ▼
[Online Lobby]
     │
     ├── User sends invite ─────────────┐
     │                                  │
     └── User receives invite ───────┐  │
                                     │  │
                                     ▼  ▼
                              [Invite Accepted]
                                     │
                                     ▼
                          [Verification Mode Selected]
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
              [QR Verification]          [Sound + Motion Verification]
                    │                                 │
                    └────────────────┬────────────────┘
                                     ▼
                             [Proximity Score]
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
             [Proximity Failed]              [Proximity Passed]
                    │                                 │
                    ▼                                 ▼
          [Retry / QR Fallback]              [WebRTC Preflight]
                                                      │
                                                      ▼
                                             [Path Classified]
                                                      │
                   ┌──────────────────────────────────┼──────────────────────────────┐
                   │                                  │                              │
                   ▼                                  ▼                              ▼
              [Direct Mode]                    [Relay Mode]                  [WebRTC Failed]
                   │                                  │                              │
                   └────────────────┬─────────────────┘                              ▼
                                    ▼                                          [Retry / Exit]
                             [Storage Check]
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
              [File Rejected]                [Transfer Ready]
                                                    │
                                                    ▼
                                              [Transferring]
                                                    │
                                                    ▼
                                             [Hash Verification]
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         │                                                     │
                         ▼                                                     ▼
                 [Hash Failed]                                          [Hash Passed]
                         │                                                     │
                         ▼                                                     ▼
              [Purge Temp Storage]                                      [Export File]
                                                                               │
                                                                               ▼
                                                                        [Complete]
```

---

# 9. Cleaner Documentation Wording

Use this version in the final spec:

## Architecture Summary

> The system uses WebSocket only as a signaling and coordination layer. It does not transfer file payloads through the application server. Once two peers accept a pairing request and pass proximity verification, the clients establish a WebRTC DataChannel. File payloads are then streamed in small binary chunks over the encrypted DataChannel. If direct peer-to-peer connectivity fails, a TURN relay is used as a fallback with strict file-size and throughput limits.

## Proximity Summary

> The system treats proximity as a scored confidence model rather than a single absolute signal. QR verification provides the most reliable cross-platform fallback. Sound and motion verification provide a lower-friction experience on supported devices. Network topology signals such as low RTT or direct ICE candidates are treated only as supporting evidence.

## Storage Summary

> The receiving browser never accumulates large files in memory. Incoming chunks are written directly to an origin-private storage backend, preferably OPFS, with IndexedDB as fallback. Memory buffering is allowed only for small files. File export is treated as a separate phase because iOS Safari may successfully receive a large file into private browser storage but still fail during export to the user-visible filesystem.

---

# 10. If You Need Real Rendered Images

For production docs, I recommend one of these:

## Option A — draw.io / diagrams.net

Best for architecture diagrams.

Use boxes:

```text
Vercel Static Hosting
Client Browser A
Client Browser B
AWS Signaling Server
TURN Relay
WebRTC DataChannel
Storage Engine
```

Export as:

```text
SVG for docs
PNG for pitch deck
PDF for architecture spec
```

## Option B — SVG diagrams

Best if you want diagrams to render in GitHub, Notion, Docs, etc.

## Option C — Figma

Best for polished product / investor diagrams.

## Option D — ASCII

Best for technical README files and code comments.

---

# 11. Practical Recommendation

For your documentation, use:

```text
README.md:
  ASCII diagrams

Technical spec PDF:
  draw.io exported SVG diagrams

Landing page:
  Figma / SVG visual diagrams

Developer comments:
  simplified ASCII flow diagrams
```

Mermaid is useful for internal notes, but for this project I would not rely on Mermaid as the primary diagram format.

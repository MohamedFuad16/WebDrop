# Packet: Architecture Documentation

Objective:
Create a complete documentation package from scratch that can render to at least 20 pages and explains WebDrop architecture, UI, flows, diagrams, screenshots, and technical foundations.

Ownership:
- `docs/webdrop-complete-guide.md`
- New diagram source/assets under `assets/diagrams/`
- Supporting workflow notes under `.workflow/webdrop-audit-docs-qa/results/docs-authoring.md`

Required content:
- Product overview and problem statement.
- Static app structure and module map.
- UI state machine and orbit interaction flow.
- Invite/verification/WebRTC negotiation/transfer/storage/export flow.
- Signaling adapter and TURN provider boundaries.
- Detailed plain-language explanations of WebRTC, RTCDataChannel, Blob, ArrayBuffer, chunks, backpressure, workers, OPFS, IndexedDB, NAT, STUN, TURN, relay servers, ICE candidates, candidate-pair stats, and why file payloads do not go over WebSocket.
- Current limitations and production backend roadmap.
- Screenshots/images from `output/screenshots/ui-elements-en/` and `output/screenshots/ui-elements-ja/` where useful.
- Architecture diagrams and flow/state diagrams using repo-native SVG/Markdown assets, not Mermaid as the only production source.
- Render guidance for PDF/print.

Do:
- Follow graph-first navigation first; if graph is stale, say so and continue scoped.
- Tie docs to actual files/modules.
- Write enough content to produce 20+ pages when rendered.
- Include image references that exist.
- Write `.workflow/webdrop-audit-docs-qa/results/docs-authoring.md`.

Do not:
- Edit app behavior.
- Publish or push.

Expected output:
- New/updated documentation files.
- List of files changed.
- Notes on render assumptions and remaining gaps.

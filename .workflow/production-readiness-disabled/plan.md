# WebDrop Production Readiness, Disabled by Default

Goal: prepare real proximity evidence, WebRTC/DataChannel transfer, signaling integration, and durable receive storage while keeping all production paths disabled by default.

Success criteria:
- Real mic chirp generation/detection and motion tilt/bump capture exist behind explicit disabled feature flags.
- Permission requests are explicit-user-gesture APIs and never auto-run.
- Frontend can send real proximity telemetry to WebSocket signaling when enabled.
- WebRTC transport supports offer/answer/ICE, receiver data channels, control/file envelopes, backpressure, ACK/cancel/progress/retry readiness.
- Storage worker supports OPFS, IndexedDB, capped memory fallback, quota, byte/hash verification, export, and cleanup readiness.
- AWS signaling backend remains schema-validated, origin/rate-limited, ephemeral-pair/TURN ready, and payload-log free.
- Obsolete `gemini-code-1781434503037.md` is removed.
- A new evidence-backed implementation checklist states ready vs remaining work.

Constraints:
- Production WSS, TURN, proximity ceremony, and real transfer stay disabled by default.
- QR backend/token logic can be ready without implementing QR UI.
- Do not touch or restore unrelated user changes.
- File bytes never travel through WebSocket.

Verification:
- Static module checks
- Existing backend tests and smoke
- New targeted frontend/worker tests or deterministic probes
- Browser smoke for disabled-default behavior
- Workflow and secret checks

# agent.md — Router

**web_drop_v2** is a mobile-first, zero-build static PWA for AirDrop-style proximity file transfer: peers discover each other, verify physical closeness (ultrasound + bump/tilt or QR), then send files peer-to-peer over WebRTC data channels. A separate Node WebSocket server (`azure cloud server/`) does signaling + TURN.

**Stack:** Vanilla ES modules (no framework/bundler), Service Worker PWA, WebRTC, WebSocket, Web Audio + DeviceMotion, OPFS/IndexedDB/Blob, Node test runner + Playwright.

## Routing table — read the file that matches the task
| Task concerns | Read |
|---|---|
| Big picture, module map, data/control flow | `agent/architecture.md` |
| Install / build / run / serve / dev | `agent/setup.md` |
| Signaling protocol, data-channel protocol, endpoints, auth | `agent/api.md` |
| UI components + JS module responsibilities | `agent/components.md` |
| Data models, message/packet formats, persistence, state | `agent/data.md` |
| Naming, import style, WHERE new files go | `agent/conventions.md` |
| Test strategy + how to run tests | `agent/tests.md` |
| Known issues, fallbacks, gotchas | `agent/errors.md` |
| Where keys/URLs/config live (pointers only) | `agent/secrets.md` |
| Why decisions were made (ADRs) | `agent/decisions.md` |
| Current status + recent changes | `agent/state.md` |
| Module dependency/impact graph | `agent/graph/graph.md` |

**Impact analysis:** before changing a module, check `agent/graph/` (graph.md + dependencies.json/.dot + architecture.svg) to see what depends on it.

**After making changes:** update `agent/state.md` (current state + dated entry) and append an ADR to `agent/decisions.md` for notable decisions.

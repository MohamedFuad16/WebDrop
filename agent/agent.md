# agent.md — Router

**web_drop_v2** is a mobile-first, zero-build static PWA for AirDrop-style file transfer. Peers verify closeness (ultrasound, bump/tilt or QR), then send files over WebRTC. A separate Node WebSocket server (`azure cloud server/`) does signaling + TURN.

**Stack:** vanilla ES modules, Service Worker, WebRTC, WebSocket, Web Audio, Playwright.

## Routing table
| Task concerns | Read |
|---|---|
| Big picture, module map, flow | `agent/architecture.md` |
| Install, build, run, dev | `agent/setup.md` |
| Signaling and data-channel protocol, auth | `agent/api.md` |
| UI components, JS module roles | `agent/components.md` |
| Data models, packet formats, persistence | `agent/data.md` |
| Naming, imports, where new files go | `agent/conventions.md` |
| Test strategy and commands | `agent/tests.md` |
| Known issues, gotchas | `agent/errors.md` |
| Keys/URLs/config (pointers only) | `agent/secrets.md` |
| ADRs: why decisions were made | `agent/decisions.md` |
| Current status, recent changes | `agent/state.md` |
| Open issues, roadmaps | `agent/backlog.md` |
| Module dependency/impact graph | `agent/graph/graph.md` |
| Full pre-trim history | `agent/archive/` |

**Impact analysis:** before changing a module, check `agent/graph/`.

**After changes:** update `agent/state.md` (dated entry) and append an ADR to `agent/decisions.md` for notable decisions.

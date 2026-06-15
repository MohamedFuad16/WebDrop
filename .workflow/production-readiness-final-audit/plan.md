# Production readiness final audit

## Goal

Clean and verify the complete WebDrop static app plus AWS signaling folder, update the release to `1.0.7`, document what remains unfinished, research server sizing, and push the finished state to GitHub `main`.

## Constraints

- Preserve existing user and prior-agent work unless a file is clearly generated or broken.
- Keep all long-lived secrets out of tracked files.
- Keep file bytes on WebRTC/DataChannel; WebSocket handles coordination only.
- Keep production microphone, motion, camera, signaling, and transfer flags disabled unless explicitly enabled by deployment config.
- Use graph-aware navigation first; graph traversal is currently stale and must be recorded as such.

## Work Packets

- HTML/accessibility.
- CSS/responsive visual polish.
- App controller/UI/i18n.
- Services, WebRTC, transfer, storage, workers.
- AWS signaling backend, nginx, systemd, scripts.
- Documentation and architecture.
- Tests, package hygiene, secret scan.
- Rendered browser QA.

## Required Evidence

- Root static check and tests.
- AWS backend check and tests.
- Browser smoke for connection flow, settings, responsive widths.
- Secret scan proving supplied TURN token is not tracked.
- Search for stale SFU wording.
- Git status review before push.
- Server sizing research with source links.

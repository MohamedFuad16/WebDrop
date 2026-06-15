# Dynamic Island and QR Production Integration

Goal: integrate only the reusable AI Dynamic Island connection and QR surfaces into WebDrop, then complete frontend/backend QR and production-flow wiring while keeping deployment as the only external infrastructure step.

Success criteria:
- Dynamic Island connection and QR states reuse the supplied component's motion and visual language.
- Demo-only pause, reverse, standalone theme, and playback controls are not imported.
- Island follows WebDrop light/dark theme and device-safe-area layout.
- Connected state shows current user, flow animation, and connected peer.
- iPhone-to-iPhone production pairing can issue, display, scan, verify, cancel, and close a backend one-time QR token.
- Existing audio/motion ceremony remains available for non-QR or fallback paths.
- Production WebSocket, TURN, chat, DataChannel transfer, storage, and QR paths are wired but deployment/configuration remains external.
- Provided Cloudflare demo credentials are never placed in tracked files.

Constraints:
- Preserve unrelated worktree changes.
- File bytes never travel through WebSocket.
- Use the supplied component only as a source; do not modify it.
- Keep the default static app usable with mock signaling.

Verification:
- Root and AWS static/tests
- QR backend integration tests
- Responsive desktop/mobile browser smoke
- Dark/light island visual checks
- Secret scan and workflow verification

# WebDrop AWS Proximity Readiness Workflow

Goal: make the Azure signaling folder ready for future proximity score analysis and permission-policy reporting without activating proximity enforcement.

Success criteria:
- Proximity telemetry can be normalized and scored server-side behind a disabled-by-default flag.
- Permission requirements for microphone, motion, QR fallback, and proximity analysis are documented and exposed without requesting or activating browser permissions.
- Existing signaling, TURN, nginx, deployment, and smoke behavior keep passing.
- Multiple subagents audit code, security, deployment/docs, and test coverage before final report.

Constraints:
- Keep work inside `azure cloud server/`.
- Do not store real Cloudflare tokens.
- Do not turn proximity scoring into an enforcement gate yet.
- Do not route file bytes through WebSocket.

Verification:
- `npm run check`
- `npm test`
- local smoke script against a running server
- secret scan for the pasted Cloudflare token
- `git diff --check`

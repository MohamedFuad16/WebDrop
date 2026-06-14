# Runtime Agent Packet

Audit JS/runtime/scripts for safety before push.

Focus:
- `js/`, `workers/`, `scripts/`, `service-worker.js`.
- Recent fixes: peer escaping, service-worker cache graph, send fallback, WebRTC close, storage worker timeout.
- Run `npm run check`; optional targeted smoke if useful.

Output:
- Write `.workflow/webdrop-folder-safety-push/results/runtime.md`.
- Include findings, fixes, and commands.
- Do not push.

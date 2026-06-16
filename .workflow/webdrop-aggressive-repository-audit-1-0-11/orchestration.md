# Orchestration: WebDrop aggressive repository audit 1.0.11

## Execution Rules

- Keep the original objective intact.
- Ask for approval before risky, expensive, external, or destructive actions.
- Keep immediate blocking work local.
- Delegate only bounded, disjoint, materially useful packets.
- Integrate packet results before final verification.

## Branching Rules
- If a finding is reproducible and low-risk, fix it with a focused regression test.
- If a requested tool is absent, record the absence and use the nearest repo-native or lightweight equivalent rather than adding heavy tooling without clear value.
- If a browser/device behavior cannot be proven in emulation, test available viewport/DPR approximations and record the physical-device limitation.
- If generated artifacts drift only because of a version/no-op capture, defer regeneration unless UI or docs changed.
- If a security scan references ignored secrets or `.env`, do not print values; report path/category only.

## Packet Prompts
- Frontend/static/a11y: inspect index/html shell, CSS sheets/orbit/responsive, app-view interactions, localization, labels, focus, inert, and controls.
- Dynamic Island: inspect DynamicIsland JS/CSS, safe-area geometry, state transitions, rapid open/close, reduced motion, device matrix needs.
- Backend/security: inspect `aws cloud server/src`, message schemas, CORS, rate limits, TURN token handling, QR/proximity, error responses, tests.
- Transfer/storage: inspect WebRTC transport, data channel protocol, transfer engine, storage client/worker, hashing, cancellation, backpressure tests.
- Performance/release QA: inspect package scripts, dependency audit, generated docs/PDFs, workflow state, CI/deploy configuration, final report needs.

## Completion Audit
- All packet results are integrated or explicitly deferred with reason.
- Root/AWS checks and browser Dynamic Island QA are recorded.
- Final report includes architecture, commands, findings, device matrix, performance/security notes, limitations, and reproduction commands.

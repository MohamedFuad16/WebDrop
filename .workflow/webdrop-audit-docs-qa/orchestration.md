# WebDrop Audit, Documentation, and Render QA Orchestration

Goal:
Run a five-lane audit and documentation workflow for the static WebDrop app, then integrate fixes and documentation deliverables.

Success criteria:
- HTML, CSS, and JS each receive a focused bug/lint/refactor audit.
- Any accepted low-risk fixes are integrated without changing unrelated behavior.
- A complete WebDrop technical document is written from scratch with architecture, flow/state diagrams, screenshots/images, and detailed explanations of WebRTC, DataChannel, Blob, ArrayBuffer, NAT, STUN/TURN/relay servers, storage, workers, and the current mock-service boundary.
- The documentation is at least 20 pages when rendered or sectioned for print/PDF.
- A separate formatting QA pass checks layout, spacing, image placement, diagram readability, and language consistency.
- Verification evidence is recorded in the workflow final report.

Current context:
- Static app in `/Users/mfuad16/Documents/web_drop_v2`.
- App is vanilla HTML/CSS/JS with generated PDFs and localized UI screenshot inventories.
- Git remote `origin` points to `https://github.com/MohamedFuad16/WebDrop.git`.
- Recent commit pushed to remote: `bb39015`.

Constraints:
- Follow graph-first navigation before large reads. Current graph index appears stale/unrelated, so agents should keep reads scoped after graph lookup.
- Preserve unrelated local changes if any appear.
- Do not force-push or publish unless explicitly asked again after this workflow.
- Keep edits scoped to assigned lanes.

Risks:
- Documentation can drift from code if it is not tied to actual modules.
- Large rendered documents can hide formatting defects unless checked visually.
- CSS/JS audits may conflict if workers edit shared files; default to audit notes unless a fix is narrow and lane-owned.

Approval required:
- External publishing, force-push, destructive cleanup, or broad rewrites.
- Not required for local audit notes, documentation drafts, or local verification.

Workflow artifact path:
`.workflow/webdrop-audit-docs-qa/`

Work packets:
1. `html-audit`: Audit `index.html` and semantic/accessibility structure.
2. `css-audit`: Audit CSS modules for bugs, lint risks, responsive regressions, and refactor opportunities.
3. `js-audit`: Audit JS modules, workers, capture/generation scripts, state flow, and obvious runtime bugs.
4. `architecture-docs`: Build a full 20+ page documentation package from scratch with diagrams, flows, images, and glossary-style technical explanations.
5. `format-qa`: Independently review rendered documentation formatting and report issues/fixes.

Integration policy:
- Main agent integrates only evidence-backed findings.
- If an audit recommends a risky refactor, record it as pending rather than applying it during this run.
- Documentation owns `docs/webdrop-complete-guide.md` plus diagram assets under `assets/diagrams/`.
- Formatting QA should not rewrite core app code.

Verification:
- `npm run check`
- `node --check` on changed JS/CJS/MJS files
- Markdown/doc link and image existence checks
- Render documentation to PDF or print-ready HTML/PDF where possible
- Visual QA of rendered pages/contact sheets

Reusable artifacts:
- Final workflow report at `.workflow/webdrop-audit-docs-qa/final-report.md`
- Packet outputs under `.workflow/webdrop-audit-docs-qa/results/`

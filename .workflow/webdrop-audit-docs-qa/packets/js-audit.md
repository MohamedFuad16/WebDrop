# Packet: JS Audit

Objective:
Audit JavaScript modules, workers, and scripts for bugs, lint/test gaps, state-flow problems, localization issues, async/event cleanup, and refactor opportunities.

Ownership:
- `js/`, `workers/`, and `scripts/` files.
- Read-only audit by default.
- If a fix is narrow and JS-only, edit directly and report it.

Do:
- Follow graph-first navigation first; if graph is stale, say so and continue scoped.
- Inspect bootstrap/state/controller/view/services/storage/workers and generator scripts as needed.
- Run `npm run check` and `node --check` on relevant JS/CJS/MJS files where possible.
- Write findings to `.workflow/webdrop-audit-docs-qa/results/js-audit.md`.

Do not:
- Rewrite app architecture broadly.
- Edit docs/CSS/HTML except to note required integration.
- Publish or push.

Expected output:
- Findings ordered by severity with file/line references.
- Refactor candidates separated from bugs.
- Test/check evidence.

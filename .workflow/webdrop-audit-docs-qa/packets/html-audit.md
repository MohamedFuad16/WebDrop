# Packet: HTML Audit

Objective:
Audit `index.html` for bugs, semantic structure, accessibility, localization attributes, dead controls, form/input correctness, and refactor opportunities.

Ownership:
- Read-only audit by default.
- If a fix is tiny and clearly HTML-only, edit `index.html` directly and report it.

Do:
- Follow graph-first navigation first; if graph is stale, say so and continue scoped.
- Inspect `index.html` and only directly connected UI/i18n files as needed.
- Run relevant static checks if possible.
- Write findings to `.workflow/webdrop-audit-docs-qa/results/html-audit.md`.

Do not:
- Rewrite CSS or JS.
- Revert other changes.
- Publish or push.

Expected output:
- Findings ordered by severity with file/line references.
- Small accepted fixes, if any, with changed files listed.
- Test/check evidence.

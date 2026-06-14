# Packet: CSS Audit

Objective:
Audit CSS modules for visual bugs, syntax/lint risks, duplicated patterns, responsive layout issues, animation accessibility, and refactor opportunities.

Ownership:
- CSS files under `css/`.
- Read-only audit by default.
- If a fix is narrow and CSS-only, edit CSS directly and report it.

Do:
- Follow graph-first navigation first; if graph is stale, say so and continue scoped.
- Inspect `css/base.css`, `css/orbit.css`, `css/connected.css`, `css/sheets.css`, and `css/responsive.css`.
- Check for invalid declarations, risky overflow, motion/reduced-motion gaps, and duplicated values worth tokenizing.
- Write findings to `.workflow/webdrop-audit-docs-qa/results/css-audit.md`.

Do not:
- Edit HTML or JS except to point out integration risks.
- Change the product visual direction without evidence.
- Publish or push.

Expected output:
- Findings ordered by severity with file/line references.
- Suggested refactors separated from bugs.
- Changed files and checks if any fixes are applied.

# Packet: Documentation Formatting QA

Objective:
Independently verify that the documentation created by the architecture-docs lane is properly formatted, spaced, image-safe, diagram-readable, and renderable.

Ownership:
- Read-only QA at first.
- May write `.workflow/webdrop-audit-docs-qa/results/format-qa.md`.
- May make tiny formatting-only edits to `docs/webdrop-complete-guide.md` or diagram dimensions if the docs file already exists and the issue is obvious.

Do:
- Wait until documentation exists if necessary.
- Render or inspect the documentation in a practical way.
- Check headings, page breaks/print sections, image paths, diagram readability, table overflow, language consistency, and whether content reaches 20+ rendered/print sections.
- Write pass/fail findings to `.workflow/webdrop-audit-docs-qa/results/format-qa.md`.

Do not:
- Change app code.
- Change technical meaning without coordinating.
- Publish or push.

Expected output:
- Formatting QA report with page/section references.
- Any formatting-only changes listed.

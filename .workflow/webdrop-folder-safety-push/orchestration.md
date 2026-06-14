# WebDrop Folder Safety Sweep and Main Push

Goal:
Run a folder-wide safety sweep before pushing the current WebDrop app and documentation changes to the `main` branch.

Success criteria:
- 3-4 independent subagents inspect hygiene, frontend responsiveness, JS/runtime correctness, and docs/assets.
- Confirmed bugs are fixed or explicitly deferred with rationale.
- Obvious junk files are removed; deliverables are preserved.
- Checks pass: `npm run check`, Python compile, SVG validation, documentation path checks, responsive Playwright smoke.
- Changes are committed and pushed to `origin/main`.

Constraints:
- Graph traversal before large reads. Current graph appears stale/unrelated; keep reads scoped after noting that.
- Preserve deliverables: app code, docs, PDFs, screenshots, diagrams, workflow reports.
- Remove only obvious unwanted files: `.DS_Store`, `__pycache__`, `.pyc`, stale temporary render folders, or duplicate generated junk.
- Do not force-push unless explicitly approved after a push rejection.

Work packets:
- `hygiene-agent`: unwanted files, gitignore, repo size, tracked/generated artifacts.
- `frontend-agent`: responsive visual QA and interaction smoke.
- `runtime-agent`: JS/runtime bugs, service worker, storage/worker, scripts.
- `docs-agent`: docs/assets/image links/SVG/PDF deliverable sanity.

Integration:
Main agent accepts only evidence-backed findings and runs final verification locally before commit/push.

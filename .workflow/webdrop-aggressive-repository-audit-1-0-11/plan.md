# WebDrop aggressive repository audit 1.0.11

## Goal
Perform an aggressive repository-wide audit, testing, debugging, repair, and reporting pass for WebDrop with special depth on the Dynamic Island UI, frontend behavior, AWS signaling backend, WebRTC/file-transfer boundaries, security, accessibility, performance, responsive layout, and release readiness.

## Success Criteria
- Produce a current architecture and test map before edits.
- Run bounded parallel audit lanes and integrate findings.
- Reproduce confirmed issues, fix safely, and add regression tests where practical.
- Stress-test Dynamic Island opening/closing, geometry, reduced motion, rapid interaction, and mobile profiles.
- Run root and AWS test suites, static checks, secret audit, generated PDF/screenshot checks, backend checks, and rendered browser QA.
- Produce a final report with architecture summary, commands, issues, fixes, Dynamic Island device matrix, test totals, performance/security notes, and remaining limitations.

## Current Context
Current deployed baseline is commit `866e156`, app version `1.0.10`, on branch `main`. This workflow runs from checkpoint branch `codex/aggressive-audit-1.0.11`. The app is a static HTML/CSS/vanilla JS frontend with workers and a separate `aws cloud server/` Node.js WebSocket signaling server.

## Constraints
- Follow repository AGENTS instruction: use graph traversal before large repository reads.
- Preserve current visual design and behavior unless fixing a confirmed issue.
- Do not expose secrets or read ignored env values unless strictly needed; use examples and validation instead.
- Do not force-push or delete user work.
- No broad mock replacement of working implementations.
- Keep tests deterministic and avoid skipped/focused tests.

## Risks
- The requested audit scope is wider than current tooling: no ESLint/TypeScript/Playwright/Lighthouse configs are currently installed in package scripts.
- Physical iPhone Dynamic Island, Safari address-bar, DPR, and camera permission behavior cannot be fully proven through desktop browser emulation alone.
- Adding heavyweight tooling could create churn; prefer targeted repo-native checks plus small test additions unless a tool is clearly needed.
- Generated screenshots/PDFs can be expensive and noisy; regenerate only after confirmed UI changes.

## Approval Required
No additional approval is needed for local branch edits and tests. Approval would be required before force push, destructive cleanup, credential access, or transmitting private data.

## Work Packets
- Frontend/static/a11y audit: HTML semantics, bottom sheets, controls, i18n, accessibility contracts.
- Dynamic Island animation/device audit: state machine, geometry, close/open rapid transitions, safe-area strategy, reduced motion, device matrix.
- Backend/API/WebSocket/security audit: AWS server endpoints, schemas, CORS, rate limits, TURN, QR/proximity, WebSocket routing.
- Transfer/storage/WebRTC audit: file transfer protocol, storage worker, chunking, cancellation, backpressure, hashing.
- Performance/release QA audit: package scripts, dependency audit, source maps/build shape, generated docs/PDFs, final report.

## Integration Policy
Subagents perform read-only audits or isolated patches only if assigned. Main agent integrates accepted findings, adds tests, reruns gates, and records rejected or deferred items.

## Verification
- Root: `npm run check`, `npm test`, `npm run verify`, `npm run audit:secrets`.
- AWS server: `npm run check`, `npm test`.
- Dependency audit: `npm audit --omit=dev` at root and AWS where applicable.
- Syntax: `node --check` for scripts/server files and `python3 -m py_compile` for Python scripts.
- Workflow: `verify_workflow.py`.
- Browser QA: local static server, mobile viewport matrix, Dynamic Island open/close/rapid/reduced-motion checks, console health.
- Generated artifacts: screenshot inventory/PDF page/version checks if UI/docs change.

## Reusable Artifacts
Workflow plan, packet files, result notes, browser/device QA data, and final report in `.workflow/webdrop-aggressive-repository-audit-1-0-11/`.

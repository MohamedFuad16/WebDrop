# WebDrop official device icon cache polish

## Goal
Fix nearby-device brand badges so they render recognizable official device brands, make the nearby metadata stack cleanly, prevent stale service-worker cache from preserving old UI, run focused cleanup/performance/animation review, bump the app version, verify, and push directly to `origin/main`.

## Success Criteria
- Apple, Samsung, Google/Pixel, Android, and Windows peers are classified into official brand badges instead of the generic fallback where possible.
- Samsung is readable as a wordmark badge at nearby-list size.
- The connection history chip sits below the distance and match badges instead of wrapping awkwardly beside them.
- Package, lockfile, visible Settings version, service-worker cache version, and versioned docs/scripts all say `1.0.16`.
- The service worker creates a new cache namespace so stale `app-view.js`/CSS cannot keep the previous icon rendering.
- In-app paused motion also pauses Dynamic Island flow/scan loops.
- Static verification and rendered smoke checks pass before pushing to `main`.

## Current Context
- Graph traversal located `js/ui/app-view.js`, `css/sheets.css`, `service-worker.js`, and the versioned documentation/scripts as the relevant files.
- Previous commit on `origin/main` was `b4c342c`.
- Root tests are intentionally no-op after the user requested shipped test files be removed; `npm run verify:full` remains the release gate.

## Constraints
- Follow `AGENTS.md`: graph-aware navigation before broad reads.
- Preserve the existing visual design and only target confirmed bugs.
- Push directly to `main`, not a feature branch.

## Risks
- Existing service-worker installs can serve stale app JS/CSS unless the version changes.
- Inline SVG brand marks can become unreadable at 26px if the CSS treats every mark as the same circular icon.
- Full official trademark artwork is represented as inline SVG/text approximations; any future brand asset replacement should remain licensing-aware.

## Approval Required
No additional approval needed: the user explicitly requested cleanup, a new version, and direct push to `main`.

## Work Packets
- UI/logo explorer: check why badges are not official-looking and recommend patch points.
- Cache/version explorer: verify service-worker cache behavior and required version bump points.
- Cleanup/performance/animation explorer: inspect smoothness and stale artifact risks.
- Main integration: implement the critical CSS/JS/version/cache fixes and run QA.

## Integration Policy
Accept findings that are directly related to the current goal. Defer larger redesigns, such as transform-only Dynamic Island geometry, unless a focused bug is reproduced during this pass.

## Verification
- `npm run verify:full`
- Rendered Playwright smoke for nearby sheet in light and dark mode.
- Search for stale prior-release references.

## Reusable Artifacts
This workflow folder records the subagent packet structure and final verification for future icon/cache polish passes.

Status: complete

Summary:
- Rebalanced connected-mode orbit rings so the connected Venn pair has clear inner-ring space and every ring path has equal radial spacing.
- Added one-shot disconnect haptic feedback through a transparent native switch overlay plus a Vibration API fallback.
- Bumped the app version to 1.0.3 and regenerated English/Japanese screenshot inventories and PDFs.
- Lazy-rendered Settings avatar animation frames and reduced the service-worker shell cache.

Integrated audit fixes:
- Blocked peer reselection during verification/disconnect to prevent selected-peer and connected-peer mismatch.
- Cleared `pendingInviteId` after successful connection.
- Made service-worker runtime caching deployment-scope aware and skipped Range requests/partial PDF responses.
- Increased narrow-mobile peer hit targets to 44 px while preserving the tuned avatar visual size.
- Regenerated `graphify-out/graph.json` and `manifest.json` so graph-first navigation points at current WebDrop code.
- Marked PDFs as binary and ignored Graphify AST cache shards to keep repository checks clean.

Verification:
- `npm run check` passed.
- `git diff --check` passed after PDF binary attributes.
- Direct syntax checks passed for `service-worker.js`, `js/core/controller.js`, `js/ui/app-view.js`, and PDF/capture scripts.
- Browser QA passed at 393x852, 430x932, 412x915, and 360x800.
- Connected ring gap spread stayed under 0.02 px across the tested mobile viewports.
- Dock haptic hit target matched the visible disconnect button.
- Connect and disconnect pulses fired once each in the harness/browser tests.
- Race harness proved peer reselection during verification is ignored and stale pending state clears.
- Service-worker VM probe passed for root scope, subpath scope, PDF/runtime assets, and Range-request rejection.

# Result: rendering-performance-review

## Accepted
- Coalesce transfer progress state patches with animation-frame scheduling.
- Avoid rebuilding received-file and chat sheet DOM when the visible data did not change.
- Avoid measuring the Siri wave canvas every frame.

## Verification
- `npm run check && npm test`
- `npx playwright test tests/e2e/app-ui.spec.mjs --project=chromium-desktop --reporter=dot`
- `npm run test:e2e -- --reporter=dot`

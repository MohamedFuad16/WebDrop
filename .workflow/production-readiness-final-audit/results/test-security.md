# Test, Tooling, Package, and Secret Hygiene

## Scope

- Lane: production readiness final audit, test/security hygiene.
- Owned files touched: `package.json`, `scripts/check-js.mjs`, `test/*.js`, `.gitignore`, `.gitattributes`, `.workflow/production-readiness-final-audit/results/test-security.md`.
- Read-only evidence included `package-lock.json`, `service-worker.js`, current workflow state, and targeted connected controller/transfer files for one transient test failure.
- `AGENTS.md` was requested first but is not present at the repo root; the provided graph-first instructions were followed. Graphify traversal was attempted before broader reads and again for the failing transfer test path. The graph appears stale for this checkout.

## Fixes Applied

- Added `audit:secrets` and `verify` npm scripts.
- Expanded `scripts/check-js.mjs` from syntax-only to:
  - keep JS syntax checks for `js/`, `workers/`, `scripts/`, and `service-worker.js`;
  - verify `package.json` and `package-lock.json` root metadata/dependencies match;
  - verify `service-worker.js` `APP_VERSION`, static/runtime cache namespaces, duplicate-free asset list, existing precache assets, and no precache of `js/config/runtime-config.js`;
  - run a lightweight secret-pattern scan while skipping generated folders, dependency folders, lockfile integrity blobs, and ignored `.env*` files.
- Added tests for:
  - package version `1.0.7`, lockfile dependency sync, and npm script expectations;
  - generated-output/local-secret ignore coverage;
  - service-worker cache namespace and precache asset existence.
- Tightened generated artifact hygiene:
  - `.gitignore` now ignores `test-results/`, Playwright/blob reports, TypeScript build info, and package-manager debug logs.
  - `.gitattributes` now normalizes text files and marks common binary artifacts (`pdf`, images, zips) as binary.

## Evidence

- `npm install --package-lock-only --ignore-scripts`
  - Passed.
  - Output: `up to date, audited 2 packages in 1s`; `found 0 vulnerabilities`.
- `npm run check`
  - Passed.
  - Now covers syntax, package/lock sync, service-worker manifest/version hygiene, and secret-pattern scan.
- `npm run audit:secrets`
  - Passed.
  - Uses `node scripts/check-js.mjs --secrets-only`.
- `npm test`
  - Passed after rerun.
  - Result: 25 tests, 25 pass.
- `npm run verify`
  - Passed.
  - Result: `npm run check && npm test`; 25 tests, 25 pass.
- `npm audit --omit=dev`
  - Passed.
  - Output: `found 0 vulnerabilities`.
- Explicit secret scan command:
  - `rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!graphify-out/**' --glob '!test-results/**' --glob '!tmp/**' --glob '!output/**' --glob '!package-lock.json' --glob '!agenthistory.md' '(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|aws_secret_access_key\\s*=|aws_access_key_id\\s*=|SECRET_ACCESS_KEY\\s*=|BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{35})' .`
  - Passed with no matches.
- Ignore proof:
  - `git check-ignore -v test-results tmp .DS_Store node_modules graphify-out/cache/ast/demo.json 'aws cloud server/.env' .env .env.local npm-debug.log yarn-error.log`
  - Confirmed each path is ignored by either root `.gitignore` or `aws cloud server/.gitignore`.

## Findings

- Live release surfaces audited by this lane are consistent at `1.0.7`: `package.json`, `package-lock.json`, visible `index.html` version, and `service-worker.js` `APP_VERSION`.
- Remaining stale generated/documentation references are outside this lane's owned edit set:
  - tracked `output/pdf/*` and `output/screenshots/*/inventory.json` still contain generated `1.0.4` text;
  - `scripts/generate-demo-pdfs.py` and `scripts/capture-ui-elements.cjs` still contain `1.0.4` generator copy;
  - docs/workflow notes intentionally record old versions or TODOs to refresh generated artifacts.
- `aws cloud server/.env` exists locally but is ignored by `aws cloud server/.gitignore`; it was not opened.
- One `npm run verify` attempt briefly failed while concurrent test edits were landing: `send completion after disconnect does not resurrect transfer state` raised a clone error from a non-cloneable fake file. The current file state reran cleanly with 25/25 passing, and no production code change was needed in this lane.

## Residual Risk

- Generated PDF/screenshot artifacts remain stale relative to `1.0.7`; they should be regenerated or intentionally removed in the documentation/artifact lane.
- Secret scanning here is pattern-based and not a substitute for a dedicated entropy scanner such as Gitleaks, but it now runs in local check tooling and explicit audit evidence showed no high-confidence token matches in non-generated text surfaces.

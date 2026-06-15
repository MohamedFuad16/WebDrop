# WebDrop 1.0.10 ring island QR polish

## Goal
Ship WebDrop 1.0.10 with the avatar rings restored cleanly, QR scanner simplified, Dynamic Island close artifact removed, dark-mode candidate avatars readable, and all affected docs/tests/deploy artifacts updated.

## Success Criteria
- Orbit peer avatars have one clean visible ring in light and dark mode, without duplicate CSS rings.
- Nearby candidate/friends avatars keep white circular bases in dark mode.
- QR scanner preview removes "Use sound + motion" and keeps "Scan the nearby iPhone" on one line where practical.
- Dynamic Island close no longer leaves a top black/cancel sliver.
- App version is incremented to 1.0.10 everywhere and pushed to `origin/main` after verification.

## Current Context
Previous release `1.0.9` removed both duplicate and original-looking peer rings. User screenshots show the center avatar still has a ring while orbit peers do not, QR preview still has sound+motion fallback, and island closing has a final-frame artifact.

## Constraints
- Follow graph-first repository navigation.
- Preserve unrelated worktree changes.
- Keep QR preview permission-safe; do not auto-start camera.
- No broad cleanup outside the scoped files unless subagent audits find a direct bug.

## Risks
- Dynamic Island close timing can regress connection choreography.
- Restoring peer rings can accidentally reintroduce duplicate rings.
- Generated screenshots/PDFs and version metadata can drift from app code.

## Approval Required
No additional approval is required for normal commit/push because the user explicitly requested push. No force push or destructive cleanup is authorized.

## Work Packets
- CSS visual pass: orbit peer rings, candidate avatar bases, Dynamic Island closing visuals.
- JS behavior pass: QR fallback removal, one-line scanner title, close/cancel behavior.
- Release QA pass: tests, screenshots/PDFs, version bump, deploy verification.

## Integration Policy
Main agent owns implementation and resolves audit findings. Subagents provide bounded audit notes or patches with non-overlapping ownership.

## Verification
- `npm run verify`
- `npm run audit:secrets`
- Browser smoke in mobile light/dark, QR preview, and island close.
- Regenerate screenshot inventories/PDFs and validate page counts/version text.
- GitHub/Vercel deployment status and live URL smoke.

## Reusable Artifacts
Workflow files under this directory record the packet results and final report.

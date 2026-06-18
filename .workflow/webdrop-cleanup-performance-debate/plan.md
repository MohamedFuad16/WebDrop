# WebDrop cleanup performance debate

## Goal
Clean WebDrop after the live receive/signaling work by finding and fixing small
bugs, code-structure rough edges, and UI performance issues without changing the
current product direction.

## Success Criteria
- App behavior remains intact for discovery, connect, chat, receive/save, and
  transfer progress.
- Any accepted change is low-risk, focused, and verified with the relevant test.
- UI smoothness improves or at least avoids unnecessary work during repeated
  renders and animation cycles.
- Subagent debate outputs are captured and integrated rather than pasted raw.
- The repo remains clean of generated reports and temporary test artifacts.

## Current Context
- Static vanilla HTML/CSS/JS frontend with local/mock and live WebSocket modes.
- Azure cloud server folder contains the future signaling/TURN backend assets.
- Recent work fixed explicit receive-save flow, chat badge, random avatars,
  WSS visibility, Cloudflare TURN relay, and 256 KiB chunks.
- Graphify lookup is stale for this repo in the current environment, so this run
  uses targeted reads around known hot files after a graph attempt.

## Constraints
- Follow AGENTS.md: graph-aware navigation before large reads.
- Preserve visual design and product behavior unless fixing a confirmed issue.
- Do not expose secrets or touch deployment state.
- Do not force-push or deploy unless explicitly requested later.
- Workers/subagents must not edit overlapping files in this run.

## Risks
- Over-cleaning can destabilize a UI that was just made green.
- Animation tweaks can introduce mobile Safari regressions.
- Full e2e tests start local servers; run them sequentially to avoid port/cache
  interference.

## Approval Required
No approval is needed for local, non-destructive cleanup and tests. Approval is
required before deploys, external server changes, deleting tracked feature files,
or force-pushing.

## Work Packets
- ux-animation-review: first-time user view of discovery, connect, chat, receive,
  badges, and Dynamic Island timing.
- rendering-performance-review: layout/repaint/render-loop/asset loading risks.
- code-structure-review: small refactors that reduce duplication or bug risk.
- qa-security-review: missing tests, runtime console risks, config/secrets.
- integration: main agent accepts only bounded fixes with clear verification.

## Integration Policy
Prefer fixes that remove repeated work, strengthen fallbacks, or add regression
tests. Reject broad redesigns and speculative rewrites. If agents disagree, use
the current rendered behavior/tests as the tie-breaker.

## Verification
- `npm run verify:full`
- Focused Playwright app UI suite when frontend behavior changes.
- Live signaling and TURN relay suites when transport behavior changes.
- `git diff --check` and status cleanup before final report.

## Reusable Artifacts
This workflow can become a repeatable cleanup template if it yields useful
packet prompts and check ordering.

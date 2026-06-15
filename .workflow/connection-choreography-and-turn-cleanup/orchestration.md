# Orchestration: Connection choreography and TURN cleanup

## Execution Rules

- Keep the original objective intact.
- Ask for approval before risky, expensive, external, or destructive actions.
- Keep immediate blocking work local.
- Delegate only bounded, disjoint, materially useful packets.
- Integrate packet results before final verification.

## Branching Rules
- Complete the main implementation before spawning auditors.
- If the live TURN request fails, keep STUN fallback and record the exact status without exposing credentials.
- Accept agent edits only when they are scoped, tested, and do not conflict with the intended choreography.

## Packet Prompts
- HTML/accessibility: inspect semantic structure, settings order, labels, focus, and remove only demonstrably unwanted markup.
- CSS/responsive: inspect light/dark island contrast, topbar width, full-icon carousel stops, and phone/landscape overflow; fix only CSS/responsive files.
- JavaScript/backend: inspect transition ordering, cancellation/races, haptics, version/cache consistency, TURN secrecy/provider behavior; fix only assigned JS/backend/test files.

## Completion Audit
- Integrate each agent result explicitly.
- Run root and backend suites, rendered Browser QA, secret scan, and workflow verification.

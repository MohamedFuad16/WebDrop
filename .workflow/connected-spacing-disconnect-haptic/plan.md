Goal:
Balance all four connected-mode orbit gaps and add one-shot disconnect feedback.

Success criteria:
- The connected two-avatar cluster has clear space inside the innermost ring.
- All four ring paths use equal radial spacing in connected and disconnecting modes.
- Remaining peer avatars follow the recalculated connected ring paths.
- Clicking the dock disconnect control produces one best-effort haptic pulse.
- Three independent review agents pass functional/responsive QA, performance, and lint/bug review.
- Verified changes are committed and pushed to origin/main.

Packets:
1. Local implementation: connected ring geometry and disconnect haptics.
2. Agent QA: rendered responsive and interaction testing.
3. Agent performance review: animation, layout, and runtime cost.
4. Agent static review: lint, bugs, accessibility, and maintainability.

Integration:
Only accept findings supported by code or rendered evidence. Preserve unrelated user changes.

# Orchestration

1. Attempt graph-aware navigation, then use targeted reads for known hot files.
2. Run four parallel review lanes: UX, rendering performance, structure, QA.
3. Main agent performs only low-risk edits while reviewers run.
4. Integrate reviewer outputs into accepted/rejected decisions.
5. Verify narrow tests first, then full checks if changes touch shared behavior.
6. Remove generated test artifacts and update final report.

## Branching Rules

- If a reviewer finds a production-blocking bug, prioritize that over refactor.
- If a fix needs broad redesign, defer it into the final report.
- If tests fail because of port contention, rerun sequentially before debugging.
- If deployment/server state is requested, stop for approval and credentials.

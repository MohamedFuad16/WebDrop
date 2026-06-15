# Orchestration

1. Main agent implements proximity scoring and permission readiness under `aws cloud server/`.
2. Subagents audit four disjoint slices:
   - protocol and proximity message safety
   - TURN/security/secret handling
   - nginx/deployment/docs completeness
   - tests/smoke/folder hygiene
3. Main agent integrates actionable findings.
4. Run full folder checks and record results in `final-report.md`.

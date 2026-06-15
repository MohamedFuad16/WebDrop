Packet ID: release-qa
Objective: Audit release readiness for version 1.0.10.
Context: User expects every chat/fix to increment the app version and be pushed to main after checks.
Files / sources: package files, service worker, tests, docs, screenshot scripts, PDFs, workflow files.
Ownership: Read-only audit.
Do: List version and generated-output updates needed before push.
Do not: Edit files.
Expected output: Verification checklist.
Verification: Root tests, AWS tests, screenshots, PDFs, graph, secret audit, deployment status.

# Hygiene Agent Packet

Audit the whole folder for unwanted files and repository hygiene.

Focus:
- `.DS_Store`, `__pycache__`, `.pyc`, temporary render output, stale duplicate generated folders, accidental secrets, oversized obvious scratch files.
- `.gitignore` coverage.
- Do not remove PDFs, screenshots, docs, diagrams, source assets, or workflow reports unless clearly broken/duplicate.

Output:
- Write `.workflow/webdrop-folder-safety-push/results/hygiene.md`.
- If removing files, list exact paths and why.
- Do not push.

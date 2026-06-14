# Orchestration

## Main agent

Owns the UI fixes, live browser validation, screenshot capture, PDF integration, and final verification.

## PDF generator packet

Agent Dewey owns only `scripts/generate-demo-pdfs.py` and must not alter the app or captured screenshots.

## Independent QA packet

A separate read-only agent will inspect every rendered English and Japanese PDF page for clipping, spacing, alignment, image framing, typography, and translation presentation.

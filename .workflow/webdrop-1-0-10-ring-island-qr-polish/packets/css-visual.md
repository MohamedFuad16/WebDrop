Packet ID: css-visual
Objective: Audit avatar rings, dark-mode candidate circles, and Dynamic Island closing visuals.
Context: User screenshots showed orbit peers without the original-looking white ring, dark candidate circles blending into the sheet, and a closing island sliver.
Files / sources: css/orbit.css, css/sheets.css, css/dynamic-island.css, js/ui/app-view.js.
Ownership: Read-only audit.
Do: Identify selectors and risks.
Do not: Edit files.
Expected output: Findings for implementation.
Verification: Browser QA in light/dark mode and close-transition samples.

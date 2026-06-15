Packet ID: js-island-qr
Objective: Audit QR scanner preview and Dynamic Island close behavior.
Context: User requested removing the scanner sound/motion action, keeping the scanner title one line, and smoothing the last closing frame.
Files / sources: index.html, js/ui/dynamic-island.js, js/ui/app-view.js, js/config/i18n.js, css/dynamic-island.css.
Ownership: Read-only audit.
Do: Identify remaining visible scanner fallback paths and close-state artifacts.
Do not: Edit files.
Expected output: Findings for implementation.
Verification: Browser QA for QR preview and close frames.

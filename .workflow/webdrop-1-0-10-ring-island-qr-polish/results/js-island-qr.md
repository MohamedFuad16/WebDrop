Accepted findings:
- Remove the visible QR scanner sound/motion fallback button.
- Remove the fallback translation path from Dynamic Island refresh.
- Keep the QR scanner heading on one line when possible.
- Prevent the close-state sliver by hiding inner island chrome while the shell shrinks.

Implemented:
- `index.html` no longer includes `data-island-fallback`.
- `js/ui/dynamic-island.js` no longer wires or translates the fallback node.
- `js/config/i18n.js` camera-unavailable copy no longer points users to sound/motion.
- `.webdrop-island__qr-copy strong` uses nowrap, overflow, and ellipsis protection.

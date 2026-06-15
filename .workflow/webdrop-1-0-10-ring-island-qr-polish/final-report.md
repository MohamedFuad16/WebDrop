# Final Report: WebDrop 1.0.10 ring island QR polish

## Outcome
Implemented WebDrop `1.0.10` UI polish for the orbit avatars, dark-mode candidate sheet, QR scanner preview, and Dynamic Island close transition. The release is ready for final verification and push.

## Accepted Results
- CSS visual audit: accepted avatar-level ring restoration instead of button-level pseudo-rings; accepted white candidate/friend circles in dark mode; accepted hiding pill/cancel during island closing.
- JS island/QR audit: accepted removal of the QR scanner sound/motion button and translation, nowrap scanner headline, and closing-frame guard.
- Release QA audit: accepted the version bump, generated artifact refresh, and final verification checklist.

## Rejected Results
None. The audits were aligned with the user-reported screenshots.

## Conflicts Resolved
Restored a single visible ring by styling `.peer-node img` and `.peer-node .avatar-animation`, while keeping `.peer-node button::before` removed so the duplicate ring does not return.

## Verification Evidence
- `npm run verify`: 27/27 tests passed before screenshot/PDF regeneration.
- Rendered Browser QA at 393x852 confirmed: peer avatar border `3px rgb(255, 255, 255)`, no button pseudo-ring, zero horizontal overflow, dark candidate/friend/plus circles white, QR title one line, no sound/motion fallback text, and island pill/cancel opacity zero during close.
- English and Japanese screenshot inventories regenerated with 29 entries each.
- English and Japanese PDFs regenerated from fresh screenshots.

## Remaining Risks
Physical-device camera permission behavior and production QR pairing still require real iPhone testing after deployment configuration.

## Reusable Follow-up
For future visual ring changes, assert ring placement on the avatar element, not the 44px tap target.

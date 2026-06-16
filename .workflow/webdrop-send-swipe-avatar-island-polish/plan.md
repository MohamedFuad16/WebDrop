# WebDrop Send Swipe Avatar Island Polish

## Goal

Polish WebDrop's send swipe, default avatar ordering, and iPhone connection Dynamic Island choreography, then verify and push.

## Success Criteria

- The send sheet exposes one send affordance: choose files, then swipe up to send.
- The vertical send swipe reads as a full-width control and no longer overlaps text.
- The new `user-09.png` avatar becomes the first/default avatar.
- Existing shifted avatars keep their correct animation frame sets.
- iPhone QR pairing opens the Dynamic Island scanner path from the connection flow.
- Connection island choreography stays visible long enough to be understood and retracts before avatar merge.
- Tests and browser smoke pass before push.

## Constraints

- Follow `AGENTS.md` graph-first routing.
- Preserve product behavior outside this targeted polish.
- Do not expose secrets.

## Work Packets

- UX/animation sidecar: inspect and recommend without edits.
- Local implementation: patch send sheet, avatar config/assets, Dynamic Island timing/QR flow.
- Verification: syntax, tests, browser visual checks, final diff review.

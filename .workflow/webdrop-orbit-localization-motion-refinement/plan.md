# WebDrop orbit localization motion refinement

## Goal
Refine WebDrop's mobile orbital UI, motion system, and complete English/Japanese interface support.

## Success Criteria
- Device name and live status sit centered in the top bar between brand and controls.
- Four App Clip-inspired capsule-dash orbit lanes remain legible and separated on common phone sizes.
- Up to seven mock peers orbit without collisions or touching adjacent orbit lanes.
- Every user-facing string and accessible label can switch between English and Japanese.
- Motion is smooth, transform/opacity-based, and reduced-motion aware.
- Static checks and browser interaction/responsive QA pass.

## Current Context
- Static HTML/CSS/vanilla JS app served at `http://127.0.0.1:4180/`.
- Existing supplied eight-avatar set and one-active-peer connection workflow must remain intact.
- Graph index is stale and unrelated, so reads stay scoped to known connected files.

## Constraints
- Preserve the static Vercel-ready architecture.
- Do not add production WSS/TURN services.
- Do not imitate Apple's exact branded code; use the rounded segmented orbit language as visual inspiration.
- Preserve unrelated local changes.

## Risks
- Japanese strings can overflow compact controls.
- Wider orbit spacing can force peer avatars too close to viewport edges.
- Motion refinements can regress sheet hiding or reduced-motion behavior.

## Approval Required
None. Changes are local, reversible, and non-destructive.

## Work Packets
- Motion research: delegated read-only packet covering CSS timing, easing, performance, and accessibility.
- Main implementation: orbit geometry, top identity, localization, and motion integration.
- Verification: static checks plus live responsive browser interaction tests.

## Integration Policy
- Accept concrete, source-backed motion recommendations that fit the existing visual system.
- Reject animation advice that adds layout-triggering properties, continuous heavy filters, or excessive motion.

## Verification
- `npm run check` and direct module syntax validation.
- Mobile browser matrix at 360x800, 390x844, 412x915, and 430x932.
- English and Japanese copy, sheets, connection flow, orbit spacing, console, and reduced-motion checks.

## Reusable Artifacts
- Translation dictionary and locale helper.
- Workflow notes and final verification record.

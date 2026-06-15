# Connection choreography and TURN cleanup

## Goal
Polish the connection choreography and mobile settings layout, replace the invalid demo Cloudflare credential pair in the ignored server environment, and leave WebDrop ready for AWS deployment plus physical proximity calibration.

## Success Criteria
- The communication island appears immediately after the connection swipe and remains visually strong in light and dark themes.
- The island retracts before the two profile icons merge into the connected Venn state.
- The top bar removes the centered self-device label and gives the WebDrop connection label enough width to show the peer name on one line.
- Settings order is device name, profile icon, profile ring, language, app information, and version.
- The profile carousel shows complete icons only at rest on iPhone 15 Pro sizing.
- Version is 1.0.6.
- New Cloudflare TURN values exist only in the ignored backend `.env` and generate temporary ICE credentials successfully.
- Independent post-fix agents find and repair remaining bounded HTML/CSS/JS/backend issues.

## Current Context
The clean static preview is running at `http://127.0.0.1:4181/?qa=dynamic-island-final-106`. Production runtime flags remain disabled until AWS deployment.

## Constraints
- Preserve unrelated dirty-worktree changes and existing deleted files.
- Do not commit or document the Cloudflare API token.
- Do not activate microphone, motion, camera, or production signaling by default.
- File bytes remain on WebRTC DataChannel, never WebSocket.

## Risks
- Connection timing changes can regress haptics, cancellation, or duplicate connection guards.
- Carousel sizing can clip selection rings or create overflow on narrow devices.
- TURN provider testing must not log the long-lived token.

## Approval Required
The user explicitly authorized storing the supplied demo TURN pair in the ignored local backend `.env`. No external deployment, push, or destructive cleanup is authorized.

## Work Packets
- Main: implement UI choreography, topbar, settings ordering, carousel sizing, version, and TURN local configuration.
- Post-fix HTML/accessibility audit.
- Post-fix CSS/responsive audit and bounded fixes.
- Post-fix JavaScript/backend lifecycle audit and bounded fixes.

## Integration Policy
Agents run only after the main implementation. They must preserve concurrent work, edit only assigned files, and avoid deleting user files.

## Verification
- Root and backend checks/tests.
- Live Cloudflare temporary ICE credential request with redacted output.
- Browser mobile/desktop screenshots and interaction proof.
- Secret scan, ignored-file confirmation, and diff check.

## Reusable Artifacts
Keep final evidence and agent results inside this workflow directory without secrets.

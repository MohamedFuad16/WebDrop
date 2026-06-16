Goal:
- Add receiver-side incoming invite UX for WebDrop.

Success criteria:
- Receiver gets an automatic incoming sheet when signaling emits invite.
- Sheet shows sender avatar/name/device-style copy and requires swipe to accept.
- Cancel rejects/clears the invite.
- Accept enters existing verification flow and works with mock and production adapters.
- Existing outbound peer sheet and send/receive/chat flows keep working.

Current context:
- Controller already receives signaling "invite" but opens outbound peer sheet.
- Controller already stores local incomingInvite and establishProductionPairing accepts when active.
- AppView has a reusable bindSwipe helper and sheet lifecycle helpers.

Constraints:
- Follow AGENTS.md graph-first navigation.
- Preserve current UI theme and animation language.
- Do not expose secrets or change production server scope unless needed.
- Push current state first, then implement new changes.

Risks:
- Conflicting swipe controls if both sheets share the same DOM hooks.
- Production accept flow may wait for invite:accept echo; mock accept emits inviteAccepted.
- Incoming invite should not interrupt an active connection.

Work packets:
- Main: implement incoming invite state/UI/controller integration.
- Explorer A: audit state/signaling path for invite handling.
- Explorer B: audit sheets/i18n/CSS patterns for receiver UX.
- Final cleanup: run repo checks, graph update, browser smoke.

Verification:
- npm run verify:full.
- Browser smoke: simulate incoming invite, sheet opens, swipe accepts, connection flow starts/settles.
- Console/log check and responsive sheet check.

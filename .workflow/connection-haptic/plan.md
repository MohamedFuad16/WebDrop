Goal:
Add one-shot device feedback when a WebDrop peer connection succeeds.

Success criteria:
- Inspect Project Fathom's public implementation and record the exact native-control technique.
- Preserve the existing swipe-to-connect interaction.
- Trigger standard vibration where the Web Vibration API is supported.
- Add a best-effort iOS native-switch path without claiming unsupported automatic haptics.
- Verify connection and fallback behavior in the rendered mobile UI.

Constraints:
- Static HTML, CSS, and JavaScript only.
- No production signaling or TURN changes.
- Respect reduced motion and accessibility semantics.

Work packets:
1. External research: inspect Project Fathom and report implementation details and limitations.
2. Local integration: trace connection state, implement one-shot feedback, and avoid repeated pulses.
3. Verification: syntax checks plus mobile browser smoke test.

Integration policy:
Use the native switch only as a progressive enhancement. The application must remain fully functional when it is unavailable.

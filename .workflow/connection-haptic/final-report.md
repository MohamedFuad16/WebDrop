Accepted:
- Project Fathom's direct native-switch overlay pattern.
- Standard Vibration API pulse after successful connection where supported.
- Direct-touch iOS enhancement attached to the connect confirmation gesture.

Rejected:
- Programmatically clicking the hidden switch after WebRTC completes, because iOS 26.5 requires a direct user tap.
- Covering the entire swipe rail with the switch, because incomplete taps must not produce connection feedback.

Verification:
- All JavaScript syntax checks passed.
- Controller harness observed one pulse per successful connection.
- Mobile browser smoke passed at 393x852 with no console warnings or errors.
- Physical iPhone haptic remains device-only verification.

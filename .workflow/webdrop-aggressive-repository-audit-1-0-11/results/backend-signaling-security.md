# Result: backend-signaling-security

Accepted fixes:
- Duplicate client IDs rejected without evicting originals.
- Spoofed invite rejection blocked.
- QR verification requires accepted pairing.
- Unknown WebSocket upgrades return 404.
- Oversized RTC and transfer control messages rejected.
- TURN can fail closed when STUN fallback is disabled.

Evidence:
- `npm --prefix "aws cloud server" test`.
- `npm --prefix "aws cloud server" run check`.

# JavaScript and Backend Packet Result

## Connection choreography

- The peer sheet now finishes closing before the connecting Dynamic Island opens.
- The connecting island records its opening time and remains visible for a minimum of 900 ms with normal motion.
- Reduced-motion users receive only an 80 ms minimum interval.
- The minimum interval is cancellable. Disconnect, cancellation, or a replaced flow resolves the wait without committing the Venn merge.
- The controller waits for the island to reach its fully closed state before setting `mode: "connected"`.
- A missing/stale peer selection now exits safely instead of entering verification with an undefined peer.

## TURN session safety

- Replacing a WebSocket session with the same client id no longer allows the old socket close event to remove the new live session.
- The old ephemeral TURN bearer is invalid after replacement, while the new session bearer remains valid.
- Long-term Cloudflare TURN credentials remain server-side. The ignored `aws cloud server/.env` file was not read or modified.

## Cache and wording

- The service-worker cache namespace now matches app version `1.0.6`.
- Repository scan found no remaining `SFU` or `serverless SFU` wording outside ignored/generated dependencies.

## Verification

- Root `npm run check`: passed.
- Root `npm test`: 16/16 passed.
- Backend `npm run check`: passed.
- Backend `npm test`: 24/24 passed.
- `git diff --check` for packet-owned files: passed.
- In-app Browser attachment timed out, so this packet relies on the focused choreography tests plus the user's browser QA observation.

## Files changed by this packet

- `js/core/controller.js`
- `js/ui/app-view.js`
- `js/ui/dynamic-island.js`
- `service-worker.js`
- `test/connection-choreography.test.js`
- `aws cloud server/src/signaling-hub.js`
- `aws cloud server/test/signaling.test.js`
- `.workflow/connection-choreography-and-turn-cleanup/results/js-backend.md`

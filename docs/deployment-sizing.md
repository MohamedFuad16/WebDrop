# Deployment Sizing

WebDrop's Azure VM service carries signaling metadata, chat messages, proximity telemetry, and WebRTC negotiation. File bytes remain peer-to-peer on `RTCDataChannel`, or traverse Cloudflare TURN when a direct path cannot be established. This keeps the signaling server much lighter than a file relay, but long-lived WebSockets still consume memory, file descriptors, TLS work, and nginx upstream connections.

## Recommended starting sizes

| Stage | Suggested instance | Use |
| --- | --- | --- |
| Local or private smoke test | Small burstable Azure VM | A few developers and short functional tests only. Do not treat small burstable CPU and 1-2 GiB memory as a 10,000-client target. |
| Hosted beta | 2 vCPU / 4 GiB Azure VM | Low-volume real-device and TURN validation with monitoring enabled. |
| First 10,000-client load-test candidate | 2 vCPU / 8 GiB Azure VM or larger | A practical single-node baseline, but capacity must be proven with staged tests. |
| Sustained production signaling | Non-burstable general-purpose Azure VM | Prefer non-burstable compute when traffic is steady, then scale horizontally with shared presence/session state. |

Treat VM sizing as a measured result, not a fixed promise. Long-lived WebSockets are light compared with file relaying, but they still consume memory, file descriptors, TLS work, and upstream nginx connections. Start with conservative load tests and scale the VM size or architecture from evidence.

Sources:

- [Azure VM sizes overview](https://learn.microsoft.com/azure/virtual-machines/sizes/overview)
- [nginx core module](https://nginx.org/en/docs/ngx_core_module.html)

## Why nginx is tuned above 10,000

nginx defaults `worker_connections` to 512. nginx also documents that this number includes proxied upstream connections, not only public clients, and that the real ceiling cannot exceed the open-file limit.

The supplied configuration therefore uses:

- `worker_processes auto`
- `worker_connections 65535`
- `worker_rlimit_nofile 200000`
- systemd `LimitNOFILE=200000`

A proxied WebSocket normally occupies a client-facing nginx connection and an upstream nginx-to-Node connection. The Node process also owns its accepted upstream socket. These settings create headroom, but they do not prove that a given Azure VM size can sustain 10,000 active users.

Source: [nginx core module](https://nginx.org/en/docs/ngx_core_module.html)

## Required proof before launch

1. Start with the conservative Artillery scenario in `azure cloud server/load/`.
2. Increase connection count in stages while recording CPU, RSS memory, event-loop delay, nginx active connections, open file descriptors, reconnect rate, and message latency.
3. Test idle sockets separately from active chat/proximity/RTC signaling traffic.
4. Test TLS termination and heartbeat behavior for at least the intended session duration.
5. Stop the test if errors, reconnect storms, event-loop delay, or memory growth exceed the operating budget.
6. Move presence, pairing, and session routing to shared state before running multiple signaling nodes.

## Proximity pairing capacity

Proximity pairing has its own capacity model, separate from raw WebSocket fan-out. The hub runs many concurrent bounded acoustic cohorts:

- `MAX_TOTAL_PROXIMITY_PARTICIPANTS` (default **100**) caps the total participants across all concurrent cohorts; joins beyond it are rejected cleanly (`proximity:session:failed`, `reason: "capacity_reached"`).
- `MAX_PROXIMITY_SESSION_CLIENTS` (default 6) caps each cohort and is clamped to a slot-floor-derived ceiling so acoustic time slots never drop below ~600 ms inside the ceremony window.

At the default 100/6, that is roughly 17 concurrent 6-person cohorts, i.e. up to ~50 simultaneous pairs. **This is a software allowance, not a proven acoustic capacity:** ~50 co-located pairs sharing one ~800 Hz ultrasonic band in one physical room is contended, and real reliability depends on devices, room acoustics, and noise. Measure it on real phones.

Reaching the documented 10,000-client target for proximity pairing is a config bump (`MAX_TOTAL_PROXIMITY_PARTICIPANTS`) plus the shared-state/multi-node path described in `../azure cloud server/README.md` (Redis/shared presence + sticky/session-routed WebSocket balancing + staged load testing).

## TURN capacity boundary

Cloudflare requires the long-term TURN key to remain server-side while the backend issues short-lived `iceServers` credentials. Cloudflare currently documents free unlimited STUN, a 1,000 GB monthly TURN free tier, and then `$0.05/GB` for data sent from Cloudflare to TURN clients.

Sources:

- [Cloudflare TURN credential generation](https://developers.cloudflare.com/realtime/turn/generate-credentials/)
- [Cloudflare TURN FAQ and pricing](https://developers.cloudflare.com/realtime/turn/faq/)

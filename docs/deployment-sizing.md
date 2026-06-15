# Deployment Sizing

WebDrop's EC2 service carries signaling metadata, chat messages, proximity telemetry, and WebRTC negotiation. File bytes remain peer-to-peer on `RTCDataChannel`, or traverse Cloudflare TURN when a direct path cannot be established. This keeps the signaling server much lighter than a file relay, but long-lived WebSockets still consume memory, file descriptors, TLS work, and nginx upstream connections.

## Recommended starting sizes

| Stage | Suggested instance | Use |
| --- | --- | --- |
| Local or private smoke test | `t3.micro` | A few developers and short functional tests only. Its 1 GiB memory and burstable CPU are not a 10,000-client target. |
| Hosted beta | `t3.medium` | Low-volume real-device and TURN validation with monitoring enabled. |
| First 10,000-client load-test candidate | `t3.large` | 2 vCPU and 8 GiB RAM provide a practical single-node baseline, but capacity must be proven with staged tests. |
| Sustained production signaling | `m7g.large` or `m7i.large` | Prefer a non-burstable general-purpose instance when traffic is steady, then scale horizontally with shared presence/session state. |

AWS documents T instances as burstable general-purpose instances intended for low-to-moderate CPU workloads. Its current instance table lists `t3.micro` with 1 GiB and `t3.large` with 8 GiB. T3 network bandwidth is also credit-based: AWS lists a 0.064 Gbps baseline for `t3.micro` and 0.512 Gbps for `t3.large`, with both able to burst higher on a best-effort basis.

Sources:

- [AWS T3 instances](https://aws.amazon.com/ec2/instance-types/t3/)
- [AWS general-purpose instance specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html)
- [AWS instance network bandwidth](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-network-bandwidth.html)

## Why nginx is tuned above 10,000

nginx defaults `worker_connections` to 512. nginx also documents that this number includes proxied upstream connections, not only public clients, and that the real ceiling cannot exceed the open-file limit.

The supplied configuration therefore uses:

- `worker_processes auto`
- `worker_connections 65535`
- `worker_rlimit_nofile 200000`
- systemd `LimitNOFILE=200000`

A proxied WebSocket normally occupies a client-facing nginx connection and an upstream nginx-to-Node connection. The Node process also owns its accepted upstream socket. These settings create headroom, but they do not prove that a given EC2 size can sustain 10,000 active users.

Source: [nginx core module](https://nginx.org/en/docs/ngx_core_module.html)

## Required proof before launch

1. Start with the conservative Artillery scenario in `aws cloud server/load/`.
2. Increase connection count in stages while recording CPU, RSS memory, event-loop delay, nginx active connections, open file descriptors, reconnect rate, and message latency.
3. Test idle sockets separately from active chat/proximity/RTC signaling traffic.
4. Test TLS termination and heartbeat behavior for at least the intended session duration.
5. Stop the test if errors, reconnect storms, event-loop delay, or memory growth exceed the operating budget.
6. Move presence, pairing, and session routing to shared state before running multiple signaling nodes.

## TURN capacity boundary

Cloudflare requires the long-term TURN key to remain server-side while the backend issues short-lived `iceServers` credentials. Cloudflare currently documents free unlimited STUN, a 1,000 GB monthly TURN free tier, and then `$0.05/GB` for data sent from Cloudflare to TURN clients.

Sources:

- [Cloudflare TURN credential generation](https://developers.cloudflare.com/realtime/turn/generate-credentials/)
- [Cloudflare TURN FAQ and pricing](https://developers.cloudflare.com/realtime/turn/faq/)

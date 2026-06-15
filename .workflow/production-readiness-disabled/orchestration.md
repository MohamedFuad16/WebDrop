# Orchestration

1. Proximity worker owns real evidence capture modules only.
2. WebRTC worker owns transport/signaling protocol modules only.
3. Storage worker owns receive storage client/worker only.
4. Audit agent checks the named production checklist against current evidence.
5. Main agent integrates app/controller/config/backend QR readiness, removes obsolete file, writes final checklist, and verifies.

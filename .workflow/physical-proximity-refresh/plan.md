# BumpBurst V2 Implementation Plan

## Goal

Replace brittle per-slot near-ultrasound polling with one continuously recorded,
server-scheduled physical ceremony that can distinguish the intended pair among
at least five nearby devices.

## Success Criteria

- Every participant records one uninterrupted ceremony buffer.
- Exactly one participant transmits in each guarded slot.
- Signatures stay above 20 kHz or emission is refused.
- At least six clients can share a session without fixed frequency-band exhaustion.
- Matching requires reciprocal acoustic evidence, bump, tilt above 30 degrees,
  valid ceremony timing, score at least 55, and a clear winner margin.
- A missed first frame completes before failure and may use one bounded retry.
- QR remains explicit and no peer identity appears before a verified match.

## Work Packets

1. Acoustic capture and coded matched-filter decoding.
2. Ceremony orchestration and telemetry.
3. Signaling scheduling and reciprocal graph matching.
4. Unit, server, browser, and physical-device verification.

## Integration Policy

Keep the existing targeted two-device ceremony compatible. Anonymous proximity
sessions use BumpBurst V2. No audible compatibility fallback is enabled.

## Remaining Physical Gate

Synthetic tests can prove scheduling, waveform generation, decoding, and
matching. Final frequency/range thresholds require recordings from real target
iPhones in the acoustic diagnostics page.

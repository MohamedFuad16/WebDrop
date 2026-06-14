export class ProximityEngine {
  async runCeremony({ capabilities }) {
    await delay(850);
    const metrics = {
      tokenFresh: true,
      acoustic: Boolean(capabilities.microphone),
      tilt: Boolean(capabilities.motion),
      bump: Boolean(capabilities.bump),
      qrFallback: !capabilities.microphone || !capabilities.motion,
      lowRttHint: true
    };
    const score = proximityScore(metrics);
    return {
      passed: score >= 58,
      score,
      metrics
    };
  }
}

export function proximityScore(metrics) {
  let score = 0;
  if (metrics.tokenFresh) score += 24;
  if (metrics.acoustic) score += 30;
  if (metrics.tilt) score += 12;
  if (metrics.bump) score += 14;
  if (metrics.lowRttHint) score += 6;
  if (metrics.qrFallback) score += 30;
  return score;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

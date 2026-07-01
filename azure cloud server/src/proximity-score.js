const DEFAULT_WEIGHTS = Object.freeze({
  sound: 0.34,
  motion: 0.26,
  bump: 0.2,
  tilt: 0.12,
  qr: 0.08
});

const DEFAULT_THRESHOLDS = Object.freeze({
  verified: 0.55,
  review: 0.4
});

export class ProximityScoreAnalyzer {
  constructor({ enabled = false, weights = DEFAULT_WEIGHTS, thresholds = DEFAULT_THRESHOLDS } = {}) {
    this.enabled = Boolean(enabled);
    this.weights = normalizeWeights(weights);
    this.thresholds = thresholds;
  }

  analyze(metrics = {}, policy = {}) {
    const normalized = normalizeMetrics(metrics);
    const weights = normalizeWeights(policy.weights || this.weights);
    const thresholds = { ...this.thresholds, ...(policy.thresholds || {}) };
    const score = clamp01(Object.entries(weights).reduce((total, [key, weight]) => {
      return total + normalized[key] * weight;
    }, 0));
    return {
      enabled: this.enabled,
      mode: this.enabled ? "analysis" : "report-only",
      score,
      decision: this.classify(score, thresholds),
      confidence: confidenceFor(normalized),
      normalized,
      reasons: reasonsFor(normalized),
      failures: failuresFor(normalized)
    };
  }

  classify(score, thresholds = this.thresholds) {
    if (!this.enabled) return "not_enforced";
    if (score >= thresholds.verified) return "verified";
    if (score >= thresholds.review) return "review";
    return "insufficient";
  }

  updatePolicy({ weights, thresholds } = {}) {
    if (weights) this.weights = normalizeWeights(weights);
    if (thresholds) this.thresholds = { ...this.thresholds, ...thresholds };
    return this.policy();
  }

  policy() {
    return {
      enabled: this.enabled,
      mode: this.enabled ? "analysis" : "report-only",
      thresholds: this.thresholds,
      weights: this.weights,
      note: `A physical proximity score of at least ${Math.round(this.thresholds.verified * 100)} percent is required when analysis is enabled.`
    };
  }
}

export function normalizeMetrics(metrics = {}) {
  return {
    sound: metricValue(metrics.soundCorrelation ?? metrics.sound ?? metrics.audio),
    motion: metricValue(metrics.motionCorrelation ?? metrics.motion),
    bump: metricValue(metrics.bumpCorrelation ?? metrics.bump),
    tilt: metricValue(metrics.tiltMatch ?? metrics.tilt),
    qr: metricValue(metrics.qrMatch ?? metrics.qr)
  };
}

function metricValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return clamp01(number);
}

function normalizeWeights(weights) {
  const entries = Object.entries({ ...DEFAULT_WEIGHTS, ...weights });
  const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0) || 1;
  return Object.fromEntries(entries.map(([key, value]) => [key, Number(value || 0) / total]));
}

function confidenceFor(metrics) {
  const activeSignals = Object.values(metrics).filter((value) => value > 0).length;
  if (activeSignals >= 4) return "high";
  if (activeSignals >= 2) return "medium";
  if (activeSignals === 1) return "low";
  return "none";
}

function reasonsFor(metrics) {
  const reasons = [];
  if (metrics.sound > 0) reasons.push("sound-token");
  if (metrics.motion > 0) reasons.push("motion-correlation");
  if (metrics.bump > 0) reasons.push("bump-correlation");
  if (metrics.tilt > 0) reasons.push("tilt-gesture");
  if (metrics.qr > 0) reasons.push("qr-fallback");
  return reasons;
}

function failuresFor(metrics) {
  const failures = [];
  if (metrics.sound < 1) failures.push("ultrasound-not-detected");
  if (metrics.motion < 1) failures.push("motion-not-correlated");
  if (metrics.bump < 1) failures.push("bump-not-detected");
  if (metrics.tilt < 1) failures.push("tilt-not-detected");
  return failures;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

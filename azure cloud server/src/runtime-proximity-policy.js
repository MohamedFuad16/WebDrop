import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_RUNTIME_PROXIMITY_POLICY = Object.freeze({
  revision: 1,
  updatedAt: null,
  scoring: Object.freeze({
    minimum: 55,
    weights: Object.freeze({
      sound: 34,
      motion: 26,
      bump: 20,
      tilt: 12,
      qr: 8
    })
  }),
  timing: Object.freeze({
    lateTapGraceMs: 6000,
    acousticWindowMs: 6000,
    matchSlopMs: 4000
  })
});

const WEIGHT_KEYS = ["sound", "motion", "bump", "tilt", "qr"];

export class PolicyValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PolicyValidationError";
    this.code = "invalid_proximity_policy";
  }
}

export class RuntimeProximityPolicy {
  constructor({ filePath = "", defaults = {}, logger } = {}) {
    this.filePath = String(filePath || "").trim();
    this.logger = logger;
    this.policy = normalizePolicy(mergePolicy(DEFAULT_RUNTIME_PROXIMITY_POLICY, defaults), {
      preserveMetadata: true
    });
    this.load();
  }

  load() {
    if (!this.filePath) return this.snapshot();
    try {
      const saved = JSON.parse(readFileSync(this.filePath, "utf8"));
      this.policy = normalizePolicy(mergePolicy(this.policy, saved), { preserveMetadata: true });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        this.logger?.warn("Ignoring an unreadable runtime proximity policy.", {
          message: error.message,
          filePath: this.filePath
        });
      }
    }
    return this.snapshot();
  }

  update(input = {}) {
    const next = normalizePolicy(mergePolicy(this.policy, input));
    next.revision = Math.max(1, Number(this.policy.revision || 1) + 1);
    next.updatedAt = new Date().toISOString();
    this.persist(next);
    this.policy = next;
    return this.snapshot();
  }

  snapshot() {
    return structuredClone(this.policy);
  }

  persist(policy) {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.next`;
    writeFileSync(temporaryPath, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
  }
}

export function analyzerPolicyFromRuntime(policy = DEFAULT_RUNTIME_PROXIMITY_POLICY) {
  const normalized = normalizePolicy(mergePolicy(DEFAULT_RUNTIME_PROXIMITY_POLICY, policy), {
    preserveMetadata: true
  });
  return {
    weights: Object.fromEntries(
      WEIGHT_KEYS.map((key) => [key, normalized.scoring.weights[key] / 100])
    ),
    thresholds: {
      verified: normalized.scoring.minimum / 100,
      review: Math.min(0.4, Math.max(0, normalized.scoring.minimum / 100 - 0.15))
    }
  };
}

function mergePolicy(base, update = {}) {
  return {
    ...base,
    ...update,
    scoring: {
      ...(base?.scoring || {}),
      ...(update?.scoring || {}),
      weights: {
        ...(base?.scoring?.weights || {}),
        ...(update?.scoring?.weights || {})
      }
    },
    timing: {
      ...(base?.timing || {}),
      ...(update?.timing || {})
    }
  };
}

function normalizePolicy(input, { preserveMetadata = false } = {}) {
  const weights = Object.fromEntries(WEIGHT_KEYS.map((key) => {
    const value = boundedNumber(input?.scoring?.weights?.[key], 0, 100, `${key} weight`);
    return [key, round(value, 2)];
  }));
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new PolicyValidationError(`Score weights must total 100 points (received ${round(total, 2)}).`);
  }
  const policy = {
    revision: preserveMetadata ? positiveInteger(input?.revision, 1) : 1,
    updatedAt: preserveMetadata && validTimestamp(input?.updatedAt) ? input.updatedAt : null,
    scoring: {
      minimum: round(boundedNumber(input?.scoring?.minimum, 35, 90, "minimum score"), 2),
      weights
    },
    timing: {
      lateTapGraceMs: Math.round(boundedNumber(input?.timing?.lateTapGraceMs, 2000, 15000, "late-tap grace")),
      acousticWindowMs: Math.round(boundedNumber(input?.timing?.acousticWindowMs, 2400, 12000, "acoustic window")),
      matchSlopMs: Math.round(boundedNumber(input?.timing?.matchSlopMs, 500, 10000, "match slop"))
    }
  };
  return policy;
}

function boundedNumber(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new PolicyValidationError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

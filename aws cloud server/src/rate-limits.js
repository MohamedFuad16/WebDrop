export class TokenBucket {
  constructor({ capacity, refillPerSecond }) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.buckets = new Map();
  }

  take(key, amount = 1) {
    const now = Date.now();
    const bucket = this.buckets.get(key) || {
      tokens: this.capacity,
      updatedAt: now
    };
    const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
    bucket.updatedAt = now;
    if (bucket.tokens < amount) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= amount;
    this.buckets.set(key, bucket);
    return true;
  }

  sweep(maxIdleMs = 300000) {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > maxIdleMs) this.buckets.delete(key);
    }
  }
}

export class ServerMetrics {
  constructor() {
    this.startedAt = Date.now();
    this.path = { direct: 0, relay: 0, failed: 0, unknown: 0 };
    this.events = new Map();
  }

  recordEvent(type) {
    this.events.set(type, (this.events.get(type) || 0) + 1);
  }

  recordPathMetric(path) {
    const key = ["direct", "relay", "failed"].includes(path) ? path : "unknown";
    this.path[key] += 1;
    this.recordEvent("rtc:path-metric");
  }

  summary({ activeClients = 0, activePairs = 0 } = {}) {
    return {
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      activeClients,
      activePairs,
      path: { ...this.path },
      events: Object.fromEntries(this.events)
    };
  }
}

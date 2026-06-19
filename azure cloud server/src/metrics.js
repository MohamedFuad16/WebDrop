export class ServerMetrics {
  constructor() {
    this.startedAt = Date.now();
    this.path = { direct: 0, relay: 0, failed: 0, unknown: 0 };
    this.events = new Map();
    this.recentEvents = [];
  }

  recordEvent(type, detail = null) {
    this.events.set(type, (this.events.get(type) || 0) + 1);
    this.recentEvents.unshift({
      type,
      at: new Date().toISOString(),
      detail: detail && typeof detail === "object" ? detail : null
    });
    this.recentEvents = this.recentEvents.slice(0, 120);
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
      events: Object.fromEntries(this.events),
      recentEvents: this.recentEvents.map((event) => ({
        ...event,
        detail: event.detail ? { ...event.detail } : null
      }))
    };
  }
}

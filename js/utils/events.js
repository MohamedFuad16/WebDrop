class EventBus {
  constructor() {
    this.events = new Map();
  }
  on(eventName, handler) {
    const listeners = this.events.get(eventName) || new Set();
    listeners.add(handler);
    this.events.set(eventName, listeners);
    return () => listeners.delete(handler);
  }
  emit(eventName, payload) {
    const listeners = this.events.get(eventName);
    if (!listeners) return;
    listeners.forEach(handler => handler(payload));
  }
}

export const bus = new EventBus();

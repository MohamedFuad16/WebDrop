export class StorageClient {
  constructor(worker, { timeoutMs = 30000 } = {}) {
    this.worker = worker;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.worker.addEventListener("message", (event) => {
      const { id, ok, payload, error } = event.data;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      ok ? pending.resolve(payload) : pending.reject(new Error(error));
    });
    this.worker.addEventListener("error", (event) => {
      this.rejectAll(new Error(event.message || "Storage worker failed"));
    });
    this.worker.addEventListener("messageerror", () => {
      this.rejectAll(new Error("Storage worker message could not be cloned"));
    });
  }

  prepareSession(session) {
    return this.call("prepare", session);
  }

  writeChunk(chunk) {
    return this.call("write", chunk);
  }

  finalize() {
    return this.call("finalize");
  }

  call(type, payload) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Storage worker timed out while handling ${type}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ id, type, payload });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

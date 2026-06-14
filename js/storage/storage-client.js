export class StorageClient {
  constructor(worker) {
    this.worker = worker;
    this.nextId = 1;
    this.pending = new Map();
    this.worker.addEventListener("message", (event) => {
      const { id, ok, payload, error } = event.data;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      ok ? pending.resolve(payload) : pending.reject(new Error(error));
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
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }
}

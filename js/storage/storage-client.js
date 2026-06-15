export class StorageClient {
  constructor(worker, { enabled = false, timeoutMs = 30000, transferChunks = false } = {}) {
    if (!worker?.postMessage || !worker?.addEventListener) throw new TypeError("StorageClient requires a Worker-like object");
    this.worker = worker;
    this.enabled = enabled === true;
    this.timeoutMs = timeoutMs;
    this.transferChunks = transferChunks === true;
    this.nextId = 1;
    this.pending = new Map();
    this.activeSessionId = null;

    this.worker.addEventListener("message", (event) => this.handleMessage(event));
    this.worker.addEventListener("error", (event) => {
      this.rejectAll(new StorageClientError("WORKER_ERROR", event.message || "Storage worker failed"));
    });
    this.worker.addEventListener("messageerror", () => {
      this.rejectAll(new StorageClientError("MESSAGE_ERROR", "Storage worker message could not be cloned"));
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
    return this.enabled;
  }

  estimateQuota(expectedBytes) {
    return this.call("estimateQuota", { expectedBytes });
  }

  async prepareSession(session) {
    if (!this.enabled) return disabledResult();
    const result = await this.call("prepareSession", { ...session, enabled: true });
    this.activeSessionId = result.sessionId;
    return result;
  }

  prepareFile(file, { sessionId = this.activeSessionId } = {}) {
    return this.enabledCall("prepareFile", { sessionId, file });
  }

  writeChunk(chunk, { sessionId = this.activeSessionId, fileId, index, byteLength, expectedHash, transfer = this.transferChunks } = {}) {
    let payload = normalizeChunkPayload(chunk, { sessionId, fileId, index, byteLength, expectedHash });
    let transferList = [];
    if (transfer) {
      const transferable = transferChunkData(payload.data);
      payload = { ...payload, data: transferable.data };
      transferList = transferable.transfer;
    }
    return this.enabledCall("writeChunk", payload, transferList);
  }

  flush({ sessionId = this.activeSessionId } = {}) {
    return this.enabledCall("flush", { sessionId });
  }

  finalizeFile(fileId, { sessionId = this.activeSessionId } = {}) {
    return this.enabledCall("finalizeFile", { sessionId, fileId });
  }

  finalize(options = {}) {
    const sessionId = options.sessionId || this.activeSessionId;
    return this.enabledCall("finalizeSession", { sessionId });
  }

  readForExport(fileId, { sessionId = this.activeSessionId } = {}) {
    return this.enabledCall("readForExport", { sessionId, fileId });
  }

  exportFile(fileId, options) {
    return this.readForExport(fileId, options);
  }

  readExportChunk(fileId, index, { sessionId = this.activeSessionId } = {}) {
    return this.enabledCall("readExportChunk", { sessionId, fileId, index });
  }

  async cleanup({ sessionId = this.activeSessionId } = {}) {
    if (!sessionId) return { deleted: false };
    const result = await this.call("deleteSession", { sessionId });
    if (sessionId === this.activeSessionId) this.activeSessionId = null;
    return result;
  }

  async abort({ sessionId = this.activeSessionId } = {}) {
    if (!sessionId) return { deleted: false, aborted: true };
    const result = await this.call("abortTransfer", { sessionId });
    if (sessionId === this.activeSessionId) this.activeSessionId = null;
    return result;
  }

  enabledCall(type, payload, transfer = []) {
    return this.enabled ? this.call(type, payload, transfer) : Promise.resolve(disabledResult());
  }

  call(type, payload, transfer = []) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new StorageClientError("TIMEOUT", `Storage worker timed out while handling ${type}`, { type }));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, type });
      try {
        this.worker.postMessage({ id, type, payload }, transfer);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  handleMessage(event) {
    const { id, ok, payload, error } = event.data || {};
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (ok) {
      pending.resolve(payload);
      return;
    }
    pending.reject(StorageClientError.from(error, pending.type));
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class StorageClientError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "StorageClientError";
    this.code = code;
    this.details = details;
  }

  static from(error, type) {
    if (typeof error === "string") return new StorageClientError("STORAGE_ERROR", error, { type });
    return new StorageClientError(error?.code || "STORAGE_ERROR", error?.message || `Storage worker failed while handling ${type}`, error?.details);
  }
}

function disabledResult() {
  return { enabled: false, backend: "disabled" };
}

function normalizeChunkPayload(chunk, options) {
  if (chunk && typeof chunk === "object" && !(chunk instanceof Blob) &&
      !(chunk instanceof ArrayBuffer) && !ArrayBuffer.isView(chunk) &&
      ("data" in chunk || "chunk" in chunk || "buffer" in chunk)) {
    return {
      ...chunk,
      sessionId: chunk.sessionId || options.sessionId,
      fileId: chunk.fileId || options.fileId,
      data: chunk.data ?? chunk.chunk ?? chunk.buffer
    };
  }
  return {
    sessionId: options.sessionId,
    fileId: options.fileId,
    index: options.index,
    byteLength: options.byteLength,
    expectedHash: options.expectedHash,
    data: chunk
  };
}

function transferChunkData(value) {
  if (value instanceof ArrayBuffer) return { data: value, transfer: [value] };
  if (ArrayBuffer.isView(value)) {
    const exactBuffer = value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
      ? value.buffer
      : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    return { data: exactBuffer, transfer: [exactBuffer] };
  }
  return { data: value, transfer: [] };
}

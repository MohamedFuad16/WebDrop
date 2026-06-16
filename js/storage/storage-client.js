const DEFAULT_SESSION_CAP_BYTES = 500 * 1024 * 1024;

export class StorageClient {
  constructor(_worker = null, { enabled = false, sessionCapBytes = DEFAULT_SESSION_CAP_BYTES } = {}) {
    this.enabled = enabled === true;
    this.sessionCapBytes = sessionCapBytes;
    this.activeSessionId = null;
    this.sessions = new Map();
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
    return this.enabled;
  }

  estimateQuota(expectedBytes = 0) {
    this.assertEnabled();
    this.assertSessionCap(expectedBytes);
    return Promise.resolve({
      enabled: true,
      backend: "blob",
      quota: this.sessionCapBytes,
      available: this.sessionCapBytes,
      expectedBytes
    });
  }

  prepareSession(session = {}) {
    this.assertEnabled();
    const id = session.id || crypto.randomUUID?.() || `rx-${Date.now()}`;
    const expectedBytes = Number.isFinite(session.expectedBytes) ? session.expectedBytes : 0;
    this.assertSessionCap(expectedBytes);
    this.sessions.set(id, {
      id,
      expectedBytes,
      receivedBytes: 0,
      metadata: session.metadata || {},
      files: new Map()
    });
    this.activeSessionId = id;
    return Promise.resolve({ enabled: true, backend: "blob", sessionId: id });
  }

  prepareFile(file, { sessionId = this.activeSessionId } = {}) {
    const session = this.requireSession(sessionId);
    const size = Number.isFinite(file.size) ? file.size : 0;
    this.assertSessionCap(session.receivedBytes + size);
    session.files.set(file.id, {
      id: file.id,
      name: file.name || "webdrop-file",
      type: file.type || "application/octet-stream",
      expectedBytes: size,
      expectedHash: file.hash || null,
      receivedBytes: 0,
      nextIndex: 0,
      chunks: []
    });
    return Promise.resolve({ enabled: true, backend: "blob", sessionId, fileId: file.id });
  }

  async writeChunk(chunk, { sessionId = this.activeSessionId, fileId, index, byteLength } = {}) {
    const session = this.requireSession(sessionId);
    const file = this.requireFile(session, fileId);
    const expectedIndex = Number.isSafeInteger(index) ? index : file.nextIndex;
    if (expectedIndex !== file.nextIndex) {
      throw new StorageClientError("CHUNK_OUT_OF_ORDER", `Expected chunk index ${file.nextIndex}, received ${expectedIndex}`);
    }
    const buffer = await normalizeChunkData(chunk);
    if (!buffer.byteLength) throw new StorageClientError("EMPTY_CHUNK", "Empty chunks are not accepted.");
    if (Number.isFinite(byteLength) && byteLength !== buffer.byteLength) {
      throw new StorageClientError("CHUNK_SIZE_MISMATCH", "Chunk byte length did not match its header.");
    }
    if (file.receivedBytes + buffer.byteLength > file.expectedBytes) {
      throw new StorageClientError("FILE_TOO_LARGE", "Received bytes exceed the file manifest size.");
    }
    this.assertSessionCap(session.receivedBytes + buffer.byteLength);

    file.chunks.push(buffer);
    file.receivedBytes += buffer.byteLength;
    file.nextIndex += 1;
    session.receivedBytes += buffer.byteLength;

    return {
      enabled: true,
      backend: "blob",
      sessionId,
      fileId,
      receivedBytes: file.receivedBytes,
      sessionReceivedBytes: session.receivedBytes,
      transferredBytes: session.receivedBytes,
      totalBytes: session.expectedBytes,
      ratio: session.expectedBytes ? session.receivedBytes / session.expectedBytes : 1
    };
  }

  flush({ sessionId = this.activeSessionId } = {}) {
    this.requireSession(sessionId);
    return Promise.resolve({ enabled: true, backend: "blob", sessionId });
  }

  finalizeFile(fileId, { sessionId = this.activeSessionId } = {}) {
    const session = this.requireSession(sessionId);
    const file = this.requireFile(session, fileId);
    this.assertFileComplete(file);
    return Promise.resolve(fileSummary(sessionId, file));
  }

  finalize(options = {}) {
    const sessionId = options.sessionId || this.activeSessionId;
    const session = this.requireSession(sessionId);
    if (session.expectedBytes !== session.receivedBytes) {
      throw new StorageClientError("SESSION_INCOMPLETE", "Received bytes do not match the transfer manifest.", {
        expectedBytes: session.expectedBytes,
        receivedBytes: session.receivedBytes
      });
    }
    const files = [...session.files.values()].map((file) => {
      this.assertFileComplete(file);
      return fileSummary(sessionId, file);
    });
    return Promise.resolve({
      enabled: true,
      backend: "blob",
      sessionId,
      receivedBytes: session.receivedBytes,
      files
    });
  }

  readForExport(fileId, { sessionId = this.activeSessionId } = {}) {
    const session = this.requireSession(sessionId);
    const file = this.requireFile(session, fileId);
    this.assertFileComplete(file);
    return Promise.resolve({
      sessionId,
      fileId,
      name: file.name,
      type: file.type,
      blob: new Blob(file.chunks, { type: file.type })
    });
  }

  exportFile(fileId, options) {
    return this.readForExport(fileId, options);
  }

  readExportChunk(fileId, index, { sessionId = this.activeSessionId } = {}) {
    const session = this.requireSession(sessionId);
    const file = this.requireFile(session, fileId);
    if (!Number.isSafeInteger(index) || index < 0 || index >= file.chunks.length) {
      throw new StorageClientError("INVALID_CHUNK_INDEX", "Export chunk index is outside the received range.");
    }
    return Promise.resolve({
      sessionId,
      fileId,
      index,
      buffer: file.chunks[index].slice(0)
    });
  }

  cleanup({ sessionId = this.activeSessionId } = {}) {
    if (!sessionId) return Promise.resolve({ deleted: false });
    const deleted = this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) this.activeSessionId = null;
    return Promise.resolve({ deleted, backend: "blob" });
  }

  abort({ sessionId = this.activeSessionId } = {}) {
    return this.cleanup({ sessionId }).then((result) => ({ ...result, aborted: true }));
  }

  assertEnabled() {
    if (!this.enabled) throw new StorageClientError("STORAGE_DISABLED", "Blob receive storage is disabled.");
  }

  assertSessionCap(bytes) {
    if (bytes > this.sessionCapBytes) {
      throw new StorageClientError("SESSION_CAP_EXCEEDED", "Transfer exceeds the 500 MB receive session cap.", {
        capBytes: this.sessionCapBytes,
        bytes
      });
    }
  }

  requireSession(sessionId) {
    this.assertEnabled();
    const session = this.sessions.get(sessionId);
    if (!session) throw new StorageClientError("SESSION_NOT_FOUND", "Receive session was not prepared.");
    return session;
  }

  requireFile(session, fileId) {
    const file = session.files.get(fileId);
    if (!file) throw new StorageClientError("FILE_NOT_FOUND", "Receive file was not prepared.");
    return file;
  }

  assertFileComplete(file) {
    if (file.expectedBytes !== file.receivedBytes) {
      throw new StorageClientError("FILE_INCOMPLETE", "Received bytes do not match the file manifest.", {
        expectedBytes: file.expectedBytes,
        receivedBytes: file.receivedBytes
      });
    }
  }
}

export class StorageClientError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "StorageClientError";
    this.code = code;
    this.details = details;
  }
}

function fileSummary(sessionId, file) {
  return {
    sessionId,
    fileId: file.id,
    name: file.name,
    type: file.type,
    backend: "blob",
    receivedBytes: file.receivedBytes,
    sha256: file.expectedHash,
    blob: new Blob(file.chunks, { type: file.type })
  };
}

async function normalizeChunkData(value) {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (value instanceof Blob) return value.arrayBuffer();
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new StorageClientError("INVALID_CHUNK", "Chunk payload must be Blob, ArrayBuffer, or a typed array.");
}

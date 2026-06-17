import { createStreamSaverAdapter } from "../vendor/streamsaver-adapter.js";

const DEFAULT_SESSION_CAP_BYTES = 500 * 1024 * 1024;
const DEFAULT_BLOB_FALLBACK_CAP_BYTES = 128 * 1024 * 1024;

export class StorageClient {
  constructor(_worker = null, {
    enabled = false,
    sessionCapBytes = DEFAULT_SESSION_CAP_BYTES,
    blobFallbackCapBytes = DEFAULT_BLOB_FALLBACK_CAP_BYTES,
    streamSaver = createStreamSaverAdapter()
  } = {}) {
    this.enabled = enabled === true;
    this.sessionCapBytes = sessionCapBytes;
    this.blobFallbackCapBytes = blobFallbackCapBytes;
    this.stream = new DownloadStreamStorageClient({ enabled, sessionCapBytes, streamSaver });
    this.blob = new BlobStorageClient({ enabled, sessionCapBytes: blobFallbackCapBytes });
    this.sessionBackends = new Map();
    this.activeSessionId = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
    this.stream.setEnabled(this.enabled);
    this.blob.setEnabled(this.enabled);
    return this.enabled;
  }

  estimateQuota(expectedBytes = 0) {
    this.assertEnabled();
    this.assertSessionCap(expectedBytes);
    const backend = this.selectBackend(expectedBytes);
    return backend.estimateQuota(expectedBytes);
  }

  prepareSession(session = {}) {
    this.assertEnabled();
    const id = session.id || crypto.randomUUID?.() || `rx-${Date.now()}`;
    const expectedBytes = Number.isFinite(session.expectedBytes) ? session.expectedBytes : 0;
    this.assertSessionCap(expectedBytes);
    const backend = this.selectBackend(expectedBytes);
    this.sessionBackends.set(id, backend);
    this.activeSessionId = id;
    return backend.prepareSession({ ...session, id, expectedBytes });
  }

  prepareFile(file, options = {}) {
    return this.backendFor(options.sessionId).prepareFile(file, options);
  }

  writeChunk(chunk, options = {}) {
    return this.backendFor(options.sessionId).writeChunk(chunk, options);
  }

  flush(options = {}) {
    return this.backendFor(options.sessionId).flush(options);
  }

  finalizeFile(fileId, options = {}) {
    return this.backendFor(options.sessionId).finalizeFile(fileId, options);
  }

  finalize(options = {}) {
    return this.backendFor(options.sessionId).finalize(options);
  }

  readForExport(fileId, options = {}) {
    return this.backendFor(options.sessionId).readForExport(fileId, options);
  }

  exportFile(fileId, options) {
    return this.readForExport(fileId, options);
  }

  readExportChunk(fileId, index, options = {}) {
    return this.backendFor(options.sessionId).readExportChunk(fileId, index, options);
  }

  async cleanup(options = {}) {
    const sessionId = options.sessionId || this.activeSessionId;
    if (!sessionId) return { deleted: false };
    const backend = this.sessionBackends.get(sessionId);
    const result = backend ? await backend.cleanup({ sessionId }) : { deleted: false };
    this.sessionBackends.delete(sessionId);
    if (this.activeSessionId === sessionId) this.activeSessionId = null;
    return result;
  }

  abort(options = {}) {
    return this.cleanup(options).then((result) => ({ ...result, aborted: true }));
  }

  selectBackend(expectedBytes = 0) {
    if (this.stream.isAvailable()) return this.stream;
    if (expectedBytes <= this.blobFallbackCapBytes) return this.blob;
    throw new StorageClientError(
      "STREAM_UNAVAILABLE",
      `Streaming downloads are unavailable and Blob fallback is limited to ${formatBytes(this.blobFallbackCapBytes)}.`,
      { expectedBytes, fallbackCapBytes: this.blobFallbackCapBytes }
    );
  }

  backendFor(sessionId = this.activeSessionId) {
    this.assertEnabled();
    const backend = this.sessionBackends.get(sessionId);
    if (!backend) throw new StorageClientError("SESSION_NOT_FOUND", "Receive session was not prepared.");
    return backend;
  }

  assertEnabled() {
    if (!this.enabled) throw new StorageClientError("STORAGE_DISABLED", "Receive storage is disabled.");
  }

  assertSessionCap(bytes) {
    if (bytes > this.sessionCapBytes) {
      throw new StorageClientError("SESSION_CAP_EXCEEDED", "Transfer exceeds the 500 MB receive session cap.", {
        capBytes: this.sessionCapBytes,
        bytes
      });
    }
  }
}

class DownloadStreamStorageClient {
  constructor({ enabled = false, sessionCapBytes = DEFAULT_SESSION_CAP_BYTES, streamSaver = globalThis.streamSaver } = {}) {
    this.enabled = enabled === true;
    this.sessionCapBytes = sessionCapBytes;
    this.streamSaver = streamSaver;
    this.activeSessionId = null;
    this.sessions = new Map();
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
    return this.enabled;
  }

  isAvailable() {
    return Boolean(
      this.enabled &&
      this.streamSaver?.createWriteStream &&
      globalThis.WritableStream &&
      globalThis.ReadableStream &&
      globalThis.navigator?.serviceWorker &&
      isDownloadSecureContext() &&
      !isLikelyIosSafari()
    );
  }

  estimateQuota(expectedBytes = 0) {
    this.assertEnabled();
    this.assertSessionCap(expectedBytes);
    if (!this.isAvailable()) {
      throw new StorageClientError("STREAM_UNAVAILABLE", "Streaming download storage is not available in this browser.");
    }
    return Promise.resolve({
      enabled: true,
      backend: "download-stream",
      quota: this.sessionCapBytes,
      available: this.sessionCapBytes,
      expectedBytes
    });
  }

  prepareSession(session = {}) {
    this.assertEnabled();
    if (!this.isAvailable()) {
      throw new StorageClientError("STREAM_UNAVAILABLE", "Streaming download storage is not available in this browser.");
    }
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
    return Promise.resolve({ enabled: true, backend: "download-stream", sessionId: id });
  }

  prepareFile(file, { sessionId = this.activeSessionId } = {}) {
    const session = this.requireSession(sessionId);
    const size = Number.isFinite(file.size) ? file.size : 0;
    this.assertSessionCap(session.receivedBytes + size);
    const stream = this.streamSaver.createWriteStream(file.name || "webdrop-file", { size });
    const writer = stream.getWriter();
    session.files.set(file.id, {
      id: file.id,
      name: file.name || "webdrop-file",
      type: file.type || "application/octet-stream",
      expectedBytes: size,
      expectedHash: file.hash || null,
      receivedBytes: 0,
      nextIndex: 0,
      writer,
      closed: false
    });
    return Promise.resolve({ enabled: true, backend: "download-stream", sessionId, fileId: file.id });
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

    await file.writer.write(new Uint8Array(buffer));
    file.receivedBytes += buffer.byteLength;
    file.nextIndex += 1;
    session.receivedBytes += buffer.byteLength;
    if (file.receivedBytes === file.expectedBytes) await closeStreamFile(file);

    return progressSummary("download-stream", session, file);
  }

  flush({ sessionId = this.activeSessionId } = {}) {
    this.requireSession(sessionId);
    return Promise.resolve({ enabled: true, backend: "download-stream", sessionId });
  }

  async finalizeFile(fileId, { sessionId = this.activeSessionId } = {}) {
    const session = this.requireSession(sessionId);
    const file = this.requireFile(session, fileId);
    this.assertFileComplete(file);
    await closeStreamFile(file);
    return fileSummary(sessionId, file, { backend: "download-stream", openUnavailable: true });
  }

  async finalize(options = {}) {
    const sessionId = options.sessionId || this.activeSessionId;
    const session = this.requireSession(sessionId);
    if (session.expectedBytes !== session.receivedBytes) {
      throw new StorageClientError("SESSION_INCOMPLETE", "Received bytes do not match the transfer manifest.", {
        expectedBytes: session.expectedBytes,
        receivedBytes: session.receivedBytes
      });
    }
    const files = [];
    for (const file of session.files.values()) {
      this.assertFileComplete(file);
      await closeStreamFile(file);
      files.push(fileSummary(sessionId, file, { backend: "download-stream", openUnavailable: true }));
    }
    return {
      enabled: true,
      backend: "download-stream",
      sessionId,
      receivedBytes: session.receivedBytes,
      files
    };
  }

  readForExport(fileId, { sessionId = this.activeSessionId } = {}) {
    const session = this.requireSession(sessionId);
    const file = this.requireFile(session, fileId);
    this.assertFileComplete(file);
    return Promise.resolve(fileSummary(sessionId, file, { backend: "download-stream", openUnavailable: true }));
  }

  exportFile(fileId, options) {
    return this.readForExport(fileId, options);
  }

  readExportChunk() {
    throw new StorageClientError("STREAM_EXPORT_UNAVAILABLE", "Streamed downloads are handed to the browser and cannot be re-read by WebDrop.");
  }

  async cleanup({ sessionId = this.activeSessionId } = {}) {
    if (!sessionId) return { deleted: false };
    const session = this.sessions.get(sessionId);
    if (session) {
      await Promise.allSettled([...session.files.values()].map((file) => abortStreamFile(file)));
    }
    const deleted = this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) this.activeSessionId = null;
    return { deleted, backend: "download-stream" };
  }

  abort(options = {}) {
    return this.cleanup(options).then((result) => ({ ...result, aborted: true }));
  }

  assertEnabled() {
    if (!this.enabled) throw new StorageClientError("STORAGE_DISABLED", "Streaming receive storage is disabled.");
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

class BlobStorageClient {
  constructor({ enabled = false, sessionCapBytes = DEFAULT_BLOB_FALLBACK_CAP_BYTES } = {}) {
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

    return progressSummary("blob", session, file);
  }

  flush({ sessionId = this.activeSessionId } = {}) {
    this.requireSession(sessionId);
    return Promise.resolve({ enabled: true, backend: "blob", sessionId });
  }

  finalizeFile(fileId, { sessionId = this.activeSessionId } = {}) {
    const session = this.requireSession(sessionId);
    const file = this.requireFile(session, fileId);
    this.assertFileComplete(file);
    return Promise.resolve(fileSummary(sessionId, file, {
      backend: "blob",
      blob: new Blob(file.chunks, { type: file.type })
    }));
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
      return fileSummary(sessionId, file, {
        backend: "blob",
        blob: new Blob(file.chunks, { type: file.type })
      });
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
      ...fileSummary(sessionId, file, { backend: "blob" }),
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

  abort(options = {}) {
    return this.cleanup(options).then((result) => ({ ...result, aborted: true }));
  }

  assertEnabled() {
    if (!this.enabled) throw new StorageClientError("STORAGE_DISABLED", "Blob receive storage is disabled.");
  }

  assertSessionCap(bytes) {
    if (bytes > this.sessionCapBytes) {
      throw new StorageClientError("BLOB_FALLBACK_CAP_EXCEEDED", `Blob fallback is limited to ${formatBytes(this.sessionCapBytes)}.`, {
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

function fileSummary(sessionId, file, options = {}) {
  return {
    sessionId,
    fileId: file.id,
    name: file.name,
    type: file.type,
    backend: options.backend || "blob",
    receivedBytes: file.receivedBytes,
    sha256: file.expectedHash,
    blob: options.blob || null,
    openUnavailable: options.openUnavailable === true
  };
}

function progressSummary(backend, session, file) {
  return {
    enabled: true,
    backend,
    sessionId: session.id,
    fileId: file.id,
    receivedBytes: file.receivedBytes,
    sessionReceivedBytes: session.receivedBytes,
    transferredBytes: session.receivedBytes,
    totalBytes: session.expectedBytes,
    ratio: session.expectedBytes ? session.receivedBytes / session.expectedBytes : 1
  };
}

async function closeStreamFile(file) {
  if (file.closed) return;
  file.closed = true;
  await file.writer.close();
}

async function abortStreamFile(file) {
  if (file.closed) return;
  file.closed = true;
  await file.writer.abort("WebDrop transfer canceled.");
}

async function normalizeChunkData(value) {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (value instanceof Blob) return value.arrayBuffer();
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new StorageClientError("INVALID_CHUNK", "Chunk payload must be Blob, ArrayBuffer, or a typed array.");
}

function isDownloadSecureContext() {
  return globalThis.isSecureContext === true || ["localhost", "127.0.0.1", "::1"].includes(globalThis.location?.hostname);
}

function isLikelyIosSafari() {
  const ua = globalThis.navigator?.userAgent || "";
  const platform = globalThis.navigator?.platform || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && globalThis.navigator?.maxTouchPoints > 1);
  return iOSDevice && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

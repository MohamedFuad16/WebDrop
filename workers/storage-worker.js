import { IncrementalSha256, sha256Hex } from "./incremental-sha256.js";

const DB_NAME = "webdrop-transfers";
const DB_VERSION = 1;
const MEMORY_CAP_BYTES = 64 * 1024 * 1024;
const QUOTA_HEADROOM_BYTES = 16 * 1024 * 1024;
const sessions = new Map();
let activeSessionId = null;
let databasePromise = null;
let commandQueue = Promise.resolve();
let memoryBytes = 0;

self.addEventListener("message", (event) => {
  const request = event.data;
  if (!request || typeof request !== "object" || !Number.isSafeInteger(request.id) || typeof request.type !== "string") {
    respond(request?.id ?? null, false, null, normalizeError(storageError("INVALID_REQUEST", "Expected { id, type, payload }")));
    return;
  }

  commandQueue = commandQueue.then(() => handleRequest(request), () => handleRequest(request));
});

async function handleRequest(request) {
  try {
    const result = await dispatch(request.type, request.payload);
    if (result instanceof WorkerResult) {
      respond(request.id, true, result.payload, null, result.transfer);
    } else {
      respond(request.id, true, result);
    }
  } catch (error) {
    respond(request.id, false, null, normalizeError(error));
  }
}

async function dispatch(type, payload = {}) {
  switch (type) {
    case "estimateQuota":
      return estimateQuota(payload?.expectedBytes);
    case "prepare":
    case "prepareSession":
      return prepareSession(payload);
    case "prepareFile":
      return prepareFile(payload);
    case "write":
    case "writeChunk":
      return writeChunk(payload);
    case "flush":
      return flush(payload);
    case "finalizeFile":
      return finalizeFile(payload);
    case "finalize":
    case "finalizeSession":
      return finalizeSession(payload);
    case "readForExport":
    case "export":
      return readForExport(payload);
    case "readExportChunk":
      return readExportChunk(payload);
    case "abortTransfer":
      return cleanupSession(payload, true);
    case "deleteSession":
    case "cleanup":
      return cleanupSession(payload, false);
    default:
      throw storageError("UNKNOWN_COMMAND", `Unknown storage command: ${type}`);
  }
}

async function prepareSession(payload) {
  if (!payload || payload.enabled !== true) {
    throw storageError("STORAGE_DISABLED", "Receive storage is disabled; prepare with enabled: true");
  }
  const id = requireId(payload.id || payload.sessionId, "session");
  if (sessions.has(id)) throw storageError("SESSION_EXISTS", `Storage session already exists: ${id}`);

  const expectedBytes = optionalNonNegativeInteger(payload.expectedBytes ?? payload.totalBytes);
  const quota = await estimateQuota(expectedBytes);
  if (expectedBytes != null && quota.available != null && expectedBytes + QUOTA_HEADROOM_BYTES > quota.available) {
    throw storageError("INSUFFICIENT_QUOTA", "Insufficient storage quota for receive session", {
      expectedBytes,
      available: quota.available,
      headroomBytes: QUOTA_HEADROOM_BYTES
    });
  }

  const session = {
    id,
    expectedBytes,
    receivedBytes: 0,
    files: new Map(),
    createdAt: Date.now(),
    finalized: false,
    backend: null,
    opfsDirectory: null,
    memoryBytes: 0,
    metadata: cloneMetadata(payload.metadata)
  };
  if ("indexedDB" in self) {
    await idbDeleteSession(id).catch(() => {});
  }
  session.backend = await selectBackend(session);
  sessions.set(id, session);
  activeSessionId = id;

  if (session.backend === "indexeddb") {
    await idbPut("sessions", serializableSession(session));
  }
  return { enabled: true, sessionId: id, backend: session.backend, quota };
}

async function selectBackend(session) {
  if (navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const receiveRoot = await root.getDirectoryHandle("webdrop-receive", { create: true });
      session.opfsDirectory = await receiveRoot.getDirectoryHandle(safeName(session.id), { create: true });
      return "opfs";
    } catch {
      // A supported API can still be unavailable in private mode or under policy.
    }
  }
  if ("indexedDB" in self) {
    try {
      await openDatabase();
      return "indexeddb";
    } catch {
      // Memory is the final, explicitly capped fallback.
    }
  }
  if (session.expectedBytes != null && memoryBytes + session.expectedBytes > MEMORY_CAP_BYTES) {
    throw storageError("MEMORY_CAP_EXCEEDED", "Durable storage is unavailable and the receive exceeds the memory fallback cap", {
      expectedBytes: session.expectedBytes,
      memoryCapBytes: MEMORY_CAP_BYTES,
      memoryBytes
    });
  }
  return "memory";
}

async function prepareFile(payload) {
  const session = getSession(payload);
  assertWritableSession(session);
  const descriptor = payload?.file || payload || {};
  const id = requireId(descriptor.id || descriptor.fileId || "default", "file");
  if (session.files.has(id)) throw storageError("FILE_EXISTS", `Storage file already exists: ${id}`);

  const file = {
    id,
    name: String(descriptor.name || id),
    type: String(descriptor.type || "application/octet-stream"),
    expectedBytes: optionalNonNegativeInteger(descriptor.expectedBytes ?? descriptor.size),
    expectedHash: normalizeHash(descriptor.expectedHash ?? descriptor.hash),
    receivedBytes: 0,
    chunkCount: 0,
    chunkByteLengths: [],
    nextIndex: 0,
    finalized: false,
    hash: new IncrementalSha256(),
    digest: null,
    chunks: session.backend === "memory" ? [] : null,
    handle: null,
    writable: null
  };

  if (file.expectedBytes != null && session.expectedBytes != null &&
      sumExpectedFileBytes(session) + file.expectedBytes > session.expectedBytes) {
    throw storageError("SIZE_EXCEEDS_SESSION", "File sizes exceed the prepared session byte count");
  }
  if (session.backend === "opfs") {
    try {
      file.handle = await session.opfsDirectory.getFileHandle(`${safeName(id)}.part`, { create: true });
      file.writable = await file.handle.createWritable({ keepExistingData: false });
    } catch {
      await fallbackFromOpfs(session);
      if (session.backend === "memory") file.chunks = [];
    }
  }
  session.files.set(id, file);
  await persistSession(session);
  return fileProgress(session, file);
}

async function fallbackFromOpfs(session) {
  const hasPersistedBytes = [...session.files.values()].some((file) => file.receivedBytes > 0 || file.chunkCount > 0);
  if (hasPersistedBytes) {
    throw storageError("OPFS_FALLBACK_UNSAFE", "OPFS became unavailable after receive data was written; restart the receive session instead of switching storage backends mid-transfer.");
  }
  for (const file of session.files.values()) {
    try {
      await file.writable?.abort();
    } catch {
      // Continue to a durable fallback even when an OPFS stream cannot abort cleanly.
    }
    file.writable = null;
    file.handle = null;
  }
  try {
    const root = await navigator.storage.getDirectory();
    const receiveRoot = await root.getDirectoryHandle("webdrop-receive");
    await receiveRoot.removeEntry(safeName(session.id), { recursive: true });
  } catch {
    // A failed OPFS area is abandoned before trying the next backend.
  }
  session.opfsDirectory = null;
  if ("indexedDB" in self) {
    try {
      await openDatabase();
      session.backend = "indexeddb";
      await persistSession(session);
      return;
    } catch {
      // Memory is the final capped fallback.
    }
  }
  if (session.expectedBytes != null && memoryBytes + session.expectedBytes > MEMORY_CAP_BYTES) {
    throw storageError("MEMORY_CAP_EXCEEDED", "OPFS and IndexedDB failed and the receive exceeds the memory fallback cap", {
      expectedBytes: session.expectedBytes,
      memoryCapBytes: MEMORY_CAP_BYTES,
      memoryBytes
    });
  }
  session.backend = "memory";
  for (const file of session.files.values()) file.chunks = [];
}

async function writeChunk(payload) {
  const session = getSession(payload);
  assertWritableSession(session);
  const file = await getOrPrepareFile(session, payload);
  if (file.finalized) throw storageError("FILE_FINALIZED", `Cannot write finalized file: ${file.id}`);

  const index = payload?.index ?? payload?.chunkIndex ?? file.nextIndex;
  if (!Number.isSafeInteger(index) || index !== file.nextIndex) {
    throw storageError("CHUNK_OUT_OF_ORDER", `Expected chunk index ${file.nextIndex}, received ${index}`, {
      expectedIndex: file.nextIndex,
      receivedIndex: index
    });
  }
  const bytes = await chunkBytes(payload);
  const declaredBytes = payload?.byteLength ?? payload?.bytes;
  if (declaredBytes != null && declaredBytes !== bytes.byteLength) {
    throw storageError("CHUNK_SIZE_MISMATCH", "Chunk byte count does not match its declared byteLength", {
      declaredBytes,
      actualBytes: bytes.byteLength
    });
  }
  if (bytes.byteLength === 0) throw storageError("EMPTY_CHUNK", "Empty chunks are not accepted");
  if (file.expectedBytes != null && file.receivedBytes + bytes.byteLength > file.expectedBytes) {
    throw storageError("FILE_SIZE_EXCEEDED", "Chunk exceeds the prepared file byte count");
  }
  if (session.expectedBytes != null && session.receivedBytes + bytes.byteLength > session.expectedBytes) {
    throw storageError("SESSION_SIZE_EXCEEDED", "Chunk exceeds the prepared session byte count");
  }
  const expectedChunkHash = normalizeHash(payload?.expectedHash ?? payload?.chunkHash);
  if (expectedChunkHash && sha256Hex(bytes) !== expectedChunkHash) {
    throw storageError("CHUNK_HASH_MISMATCH", `SHA-256 mismatch for chunk ${index}`, { index });
  }

  await persistChunk(session, file, index, bytes);
  file.hash.update(bytes);
  file.receivedBytes += bytes.byteLength;
  file.chunkCount += 1;
  file.chunkByteLengths.push(bytes.byteLength);
  file.nextIndex += 1;
  session.receivedBytes += bytes.byteLength;
  await persistSession(session);
  return fileProgress(session, file);
}

async function persistChunk(session, file, index, bytes) {
  if (session.backend === "opfs") {
    await file.writable.write(bytes);
    return;
  }
  if (session.backend === "indexeddb") {
    const stored = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await idbPut("chunks", { sessionId: session.id, fileId: file.id, index, bytes: stored });
    return;
  }
  if (memoryBytes + bytes.byteLength > MEMORY_CAP_BYTES) {
    throw storageError("MEMORY_CAP_EXCEEDED", "Memory fallback cap exceeded", {
      memoryCapBytes: MEMORY_CAP_BYTES,
      attemptedBytes: memoryBytes + bytes.byteLength
    });
  }
  file.chunks.push(bytes.slice().buffer);
  session.memoryBytes += bytes.byteLength;
  memoryBytes += bytes.byteLength;
}

async function flush(payload) {
  const session = getSession(payload);
  await persistSession(session);
  return sessionProgress(session);
}

async function finalizeFile(payload) {
  const session = getSession(payload);
  const file = getFile(session, payload);
  if (file.finalized) return fileManifest(session, file);
  if (file.expectedBytes != null && file.receivedBytes !== file.expectedBytes) {
    throw storageError("FILE_SIZE_MISMATCH", "Received file byte count does not match expected size", {
      expectedBytes: file.expectedBytes,
      receivedBytes: file.receivedBytes
    });
  }
  if (file.writable) {
    await file.writable.close();
    file.writable = null;
  }
  file.digest = file.hash.digestHex();
  if (file.expectedHash && file.digest !== file.expectedHash) {
    throw storageError("FILE_HASH_MISMATCH", "Received file SHA-256 does not match expected hash", {
      expectedHash: file.expectedHash,
      actualHash: file.digest
    });
  }
  file.finalized = true;
  await persistSession(session);
  return fileManifest(session, file);
}

async function finalizeSession(payload) {
  const session = getSession(payload);
  for (const file of session.files.values()) await finalizeFile({ sessionId: session.id, fileId: file.id });
  if (session.expectedBytes != null && session.receivedBytes !== session.expectedBytes) {
    throw storageError("SESSION_SIZE_MISMATCH", "Received session byte count does not match expected size", {
      expectedBytes: session.expectedBytes,
      receivedBytes: session.receivedBytes
    });
  }
  session.finalized = true;
  await persistSession(session);
  return {
    ...sessionProgress(session),
    files: Array.from(session.files.values(), (file) => fileManifest(session, file))
  };
}

async function readForExport(payload) {
  const session = getSession(payload);
  const file = getFile(session, payload);
  if (!file.finalized) throw storageError("FILE_NOT_FINALIZED", "Finalize the file before exporting it");
  let blob;
  if (session.backend === "opfs") {
    blob = await file.handle.getFile();
  } else if (session.backend === "indexeddb") {
    if (file.receivedBytes > MEMORY_CAP_BYTES) {
      throw storageError("EXPORT_REQUIRES_CHUNKS", "Large IndexedDB exports must be read incrementally with readExportChunk", {
        chunkCount: file.chunkCount,
        receivedBytes: file.receivedBytes
      });
    }
    const chunks = await idbGetChunks(session.id, file.id);
    blob = new Blob(chunks.map((record) => record.bytes), { type: file.type });
  } else {
    blob = new Blob(file.chunks, { type: file.type });
  }
  return { sessionId: session.id, fileId: file.id, name: file.name, type: file.type, blob };
}

async function readExportChunk(payload) {
  const session = getSession(payload);
  const file = getFile(session, payload);
  if (!file.finalized) throw storageError("FILE_NOT_FINALIZED", "Finalize the file before exporting it");
  const index = payload?.index;
  if (!Number.isSafeInteger(index) || index < 0 || index >= file.chunkCount) {
    throw storageError("INVALID_CHUNK_INDEX", `Export chunk index must be between 0 and ${Math.max(0, file.chunkCount - 1)}`);
  }

  let buffer;
  if (session.backend === "indexeddb") {
    const record = await idbGetChunk(session.id, file.id, index);
    if (!record) throw storageError("CHUNK_NOT_FOUND", `Stored export chunk not found: ${index}`);
    buffer = record.bytes;
  } else if (session.backend === "memory") {
    buffer = file.chunks[index].slice(0);
  } else {
    const opfsFile = await file.handle.getFile();
    const offset = file.chunkByteLengths.slice(0, index).reduce((sum, value) => sum + value, 0);
    buffer = await opfsFile.slice(offset, offset + file.chunkByteLengths[index]).arrayBuffer();
  }
  return new WorkerResult({
    sessionId: session.id,
    fileId: file.id,
    index,
    byteLength: buffer.byteLength,
    buffer
  }, [buffer]);
}

async function cleanupSession(payload, aborted) {
  const session = getSession(payload);
  const cleanupErrors = [];
  for (const file of session.files.values()) {
    if (file.writable) {
      try {
        await file.writable.abort();
      } catch {
        try {
          await file.writable.close();
        } catch {
          // Cleanup continues even if the stream is already unusable.
        }
      }
    }
  }
  if (session.backend === "opfs") {
    try {
      const root = await navigator.storage.getDirectory();
      const receiveRoot = await root.getDirectoryHandle("webdrop-receive");
      await receiveRoot.removeEntry(safeName(session.id), { recursive: true });
    } catch (error) {
      cleanupErrors.push(normalizeError(error));
    }
  } else if (session.backend === "indexeddb") {
    try {
      await idbDeleteSession(session.id);
    } catch (error) {
      cleanupErrors.push(normalizeError(error));
    }
  } else {
    memoryBytes = Math.max(0, memoryBytes - session.memoryBytes);
  }
  sessions.delete(session.id);
  if (activeSessionId === session.id) activeSessionId = null;
  return { sessionId: session.id, deleted: true, aborted, cleanupErrors };
}

async function estimateQuota(expectedBytes = null) {
  const estimate = await navigator.storage?.estimate?.();
  const usage = finiteInteger(estimate?.usage);
  const quota = finiteInteger(estimate?.quota);
  let persisted = false;
  if (navigator.storage?.persisted) {
    try {
      persisted = await navigator.storage.persisted();
    } catch {
      persisted = false;
    }
  }
  return {
    expectedBytes: optionalNonNegativeInteger(expectedBytes),
    usage,
    quota,
    available: quota == null ? null : Math.max(0, quota - (usage || 0)),
    persisted
  };
}

async function getOrPrepareFile(session, payload) {
  const fileId = payload?.fileId || payload?.file?.id || "default";
  if (!session.files.has(fileId)) {
    await prepareFile({ sessionId: session.id, ...(payload?.file || {}), id: fileId });
  }
  return session.files.get(fileId);
}

function getSession(payload) {
  const id = payload?.sessionId || payload?.transferId || activeSessionId;
  const session = sessions.get(id);
  if (!session) throw storageError("SESSION_NOT_FOUND", `Storage session not found: ${id || "(none)"}`);
  return session;
}

function getFile(session, payload) {
  const id = payload?.fileId || payload?.id || "default";
  const file = session.files.get(id);
  if (!file) throw storageError("FILE_NOT_FOUND", `Storage file not found: ${id}`);
  return file;
}

function assertWritableSession(session) {
  if (session.finalized) throw storageError("SESSION_FINALIZED", "Cannot write to a finalized session");
}

async function chunkBytes(payload) {
  const value = payload?.data ?? payload?.chunk ?? payload?.buffer ?? payload;
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw storageError("INVALID_CHUNK", "Chunk data must be a Blob, ArrayBuffer, or typed array");
}

function fileProgress(session, file) {
  return {
    sessionId: session.id,
    fileId: file.id,
    backend: session.backend,
    chunkCount: file.chunkCount,
    receivedBytes: file.receivedBytes,
    sessionReceivedBytes: session.receivedBytes
  };
}

function sessionProgress(session) {
  return {
    sessionId: session.id,
    backend: session.backend,
    expectedBytes: session.expectedBytes,
    receivedBytes: session.receivedBytes,
    fileCount: session.files.size,
    finalized: session.finalized
  };
}

function fileManifest(session, file) {
  return {
    ...fileProgress(session, file),
    name: file.name,
    type: file.type,
    expectedBytes: file.expectedBytes,
    sha256: file.digest,
    chunkByteLengths: file.chunkByteLengths.slice(),
    finalized: file.finalized
  };
}

function serializableSession(session) {
  return {
    ...sessionProgress(session),
    createdAt: session.createdAt,
    metadata: session.metadata,
    files: Array.from(session.files.values(), (file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      expectedBytes: file.expectedBytes,
      expectedHash: file.expectedHash,
      receivedBytes: file.receivedBytes,
      chunkCount: file.chunkCount,
      chunkByteLengths: file.chunkByteLengths,
      digest: file.digest,
      finalized: file.finalized
    }))
  };
}

async function persistSession(session) {
  if (session.backend === "indexeddb") await idbPut("sessions", serializableSession(session));
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("sessions")) database.createObjectStore("sessions", { keyPath: "sessionId" });
      if (!database.objectStoreNames.contains("chunks")) {
        const chunks = database.createObjectStore("chunks", { keyPath: ["sessionId", "fileId", "index"] });
        chunks.createIndex("byFile", ["sessionId", "fileId"]);
        chunks.createIndex("bySession", "sessionId");
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(storageError("DATABASE_BLOCKED", "IndexedDB upgrade is blocked"));
  });
  return databasePromise;
}

async function idbPut(storeName, value) {
  const database = await openDatabase();
  return idbRequest(database, storeName, "readwrite", (store) => store.put(value));
}

async function idbGetChunks(sessionId, fileId) {
  const database = await openDatabase();
  const records = await idbRequest(database, "chunks", "readonly", (store) =>
    store.index("byFile").getAll(IDBKeyRange.only([sessionId, fileId]))
  );
  return records.sort((a, b) => a.index - b.index);
}

async function idbGetChunk(sessionId, fileId, index) {
  const database = await openDatabase();
  return idbRequest(database, "chunks", "readonly", (store) => store.get([sessionId, fileId, index]));
}

async function idbDeleteSession(sessionId) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(["sessions", "chunks"], "readwrite");
    transaction.objectStore("sessions").delete(sessionId);
    const index = transaction.objectStore("chunks").index("bySession");
    const cursor = index.openKeyCursor(IDBKeyRange.only(sessionId));
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      transaction.objectStore("chunks").delete(item.primaryKey);
      item.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function idbRequest(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    let result;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function respond(id, ok, payload, error, transfer = []) {
  self.postMessage({ id, ok, payload, error }, transfer);
}

class WorkerResult {
  constructor(payload, transfer = []) {
    this.payload = payload;
    this.transfer = transfer;
  }
}

function storageError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeError(error) {
  return {
    code: error?.code || error?.name || "STORAGE_ERROR",
    message: error?.message || String(error),
    details: error?.details
  };
}

function normalizeHash(hash) {
  if (hash == null || hash === "") return null;
  const normalized = String(hash).toLowerCase().replace(/^sha-?256:/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw storageError("INVALID_HASH", "Expected a SHA-256 hex digest");
  return normalized;
}

function requireId(id, kind) {
  const value = String(id || "");
  if (!value || value.length > 200) throw storageError("INVALID_ID", `A valid ${kind} id is required`);
  return value;
}

function safeName(value) {
  return encodeURIComponent(value).replace(/%/g, "_").slice(0, 240);
}

function optionalNonNegativeInteger(value) {
  if (value == null || value === "") return null;
  if (!Number.isSafeInteger(value) || value < 0) throw storageError("INVALID_BYTE_COUNT", "Byte counts must be non-negative safe integers");
  return value;
}

function finiteInteger(value) {
  return Number.isFinite(value) ? Math.floor(value) : null;
}

function sumExpectedFileBytes(session) {
  let total = 0;
  for (const file of session.files.values()) total += file.expectedBytes || 0;
  return total;
}

function cloneMetadata(metadata) {
  if (metadata == null) return null;
  try {
    return structuredClone(metadata);
  } catch {
    throw storageError("INVALID_METADATA", "Session metadata must be structured-cloneable");
  }
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { StorageClient, StorageClientError } from "../js/storage/storage-client.js";

const MB = 1024 * 1024;

test("streams received chunks when deferred and Blob storage are unavailable", async () => {
  const writes = [];
  let closeCount = 0;
  const storage = new StorageClient(null, {
    enabled: true,
    blobFallbackCapBytes: 0,
    streamSaver: {
      createWriteStream(name, options) {
        assert.equal(name, "hello.txt");
        assert.equal(options.size, 11);
        return new WritableStream({
          write(chunk) {
            writes.push(chunk.byteLength);
          },
          close() {
            closeCount += 1;
          }
        });
      }
    }
  });

  withBrowserStreamingSupport();
  await storage.prepareSession({ id: "rx-stream", expectedBytes: 11 });
  await storage.prepareFile({ id: "file-1", name: "hello.txt", type: "text/plain", size: 11 }, { sessionId: "rx-stream" });
  await storage.writeChunk(new TextEncoder().encode("hello "), {
    sessionId: "rx-stream",
    fileId: "file-1",
    index: 0,
    byteLength: 6
  });
  await storage.writeChunk(new TextEncoder().encode("world"), {
    sessionId: "rx-stream",
    fileId: "file-1",
    index: 1,
    byteLength: 5
  });

  const result = await storage.finalize({ sessionId: "rx-stream" });
  assert.equal(result.backend, "download-stream");
  assert.deepEqual(writes, [6, 5]);
  assert.equal(closeCount, 1);
  assert.equal(result.files[0].openUnavailable, true);
  assert.equal(result.files[0].blob, null);
});

test("falls back to Blob storage for small files when streaming is unavailable", async () => {
  const storage = new StorageClient(null, {
    enabled: true,
    streamSaver: null,
    blobFallbackCapBytes: 2 * MB
  });

  withoutBrowserStreamingSupport();
  await storage.prepareSession({ id: "rx-blob", expectedBytes: 5 });
  await storage.prepareFile({ id: "file-1", name: "small.txt", type: "text/plain", size: 5 }, { sessionId: "rx-blob" });
  await storage.writeChunk(new TextEncoder().encode("small"), {
    sessionId: "rx-blob",
    fileId: "file-1",
    index: 0,
    byteLength: 5
  });

  const result = await storage.finalize({ sessionId: "rx-blob" });
  assert.equal(result.backend, "blob");
  assert.equal(result.files[0].blob instanceof Blob, true);
  assert.equal(await result.files[0].blob.text(), "small");
});

test("exports a deferred preview as a Blob even when streaming download is available", async () => {
  const writes = [];
  const storage = new StorageClient(null, {
    enabled: true,
    blobFallbackCapBytes: 2 * MB,
    streamSaver: {
      createWriteStream() {
        return new WritableStream({
          write(chunk) {
            writes.push(chunk.byteLength);
          }
        });
      }
    }
  });

  withBrowserStreamingSupport();
  withMemoryIndexedDb();
  await storage.prepareSession({ id: "rx-preview", expectedBytes: 7 });
  await storage.prepareFile({ id: "image-1", name: "photo.png", type: "image/png", size: 7 }, { sessionId: "rx-preview" });
  await storage.writeChunk(new TextEncoder().encode("preview"), {
    sessionId: "rx-preview",
    fileId: "image-1",
    index: 0,
    byteLength: 7
  });

  const exported = await storage.exportFile("image-1", { sessionId: "rx-preview", preferBlob: true });
  assert.equal(exported.backend, "indexeddb-deferred");
  assert.equal(exported.openUnavailable, false);
  assert.equal(exported.blob instanceof Blob, true);
  assert.equal(await exported.blob.text(), "preview");
  assert.deepEqual(writes, []);
});

test("rejects large receives before bytes arrive when only Blob fallback is available", async () => {
  const storage = new StorageClient(null, {
    enabled: true,
    streamSaver: null,
    blobFallbackCapBytes: 2 * MB
  });

  withoutBrowserStreamingSupport();
  assert.throws(
    () => storage.prepareSession({ id: "rx-large", expectedBytes: 3 * MB }),
    (error) => error instanceof StorageClientError && error.code === "STREAM_UNAVAILABLE"
  );
});

function withBrowserStreamingSupport() {
  Object.defineProperty(globalThis, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(globalThis, "location", {
    value: { hostname: "localhost" },
    configurable: true
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      serviceWorker: {},
      userAgent: "Mozilla/5.0 Chrome/126 Safari/537.36",
      platform: "MacIntel",
      maxTouchPoints: 0
    },
    configurable: true
  });
  Object.defineProperty(globalThis, "indexedDB", {
    value: undefined,
    configurable: true
  });
}

function withoutBrowserStreamingSupport() {
  Object.defineProperty(globalThis, "isSecureContext", { value: false, configurable: true });
  Object.defineProperty(globalThis, "location", {
    value: { hostname: "example.test" },
    configurable: true
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      userAgent: "Mozilla/5.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0
    },
    configurable: true
  });
  Object.defineProperty(globalThis, "indexedDB", {
    value: undefined,
    configurable: true
  });
}

function withMemoryIndexedDb() {
  const chunks = new Map();
  const keyFor = (key) => JSON.stringify(key);
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        const request = {};
        const database = {
          objectStoreNames: {
            contains() {
              return true;
            }
          },
          createObjectStore() {},
          transaction(_storeName, _mode) {
            const transaction = {
              error: null,
              objectStore() {
                return {
                  put(value) {
                    chunks.set(keyFor([value.sessionId, value.fileId, value.index]), value);
                    queueMicrotask(() => transaction.oncomplete?.());
                  },
                  get(key) {
                    const getRequest = {};
                    queueMicrotask(() => {
                      getRequest.result = chunks.get(keyFor(key)) || null;
                      getRequest.onsuccess?.();
                    });
                    return getRequest;
                  },
                  delete(key) {
                    chunks.delete(keyFor(key));
                    queueMicrotask(() => transaction.oncomplete?.());
                  },
                  openCursor() {
                    const cursorRequest = {};
                    queueMicrotask(() => {
                      cursorRequest.result = null;
                      cursorRequest.onsuccess?.();
                      transaction.oncomplete?.();
                    });
                    return cursorRequest;
                  }
                };
              }
            };
            return transaction;
          }
        };
        queueMicrotask(() => {
          request.result = database;
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      }
    }
  });
}

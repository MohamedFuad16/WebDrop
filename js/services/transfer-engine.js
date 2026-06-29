import { Emitter } from "../utils/emitter.js?v=1.0.90";

export class TransferEngine extends Emitter {
  constructor({ transport, storage, enabled = false }) {
    super();
    this.transport = transport;
    this.storage = storage;
    this.enabled = enabled === true;
    this.incoming = new Map();
    this.cleanups = [];
    this.storage.setEnabled?.(this.enabled);
    this.bindTransport();
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
    this.storage.setEnabled?.(this.enabled);
    return this.enabled;
  }

  async send(files, { onProgress, signal, retryFrom } = {}) {
    if (this.enabled) {
      return this.transport.sendFiles(files, { onProgress, signal, retryFrom });
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let sentBytes = 0;
    for (const file of files) {
      const chunkSize = 256 * 1024;
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const chunk = file.slice(offset, offset + chunkSize);
        await chunk.arrayBuffer();
        sentBytes += chunk.size;
        onProgress?.({
          name: file.name,
          sentBytes,
          totalBytes,
          ratio: totalBytes ? sentBytes / totalBytes : 1
        });
        await wait(8);
      }
    }
  }

  async prepareReceive() {
    if (!this.enabled) return { enabled: false };
    await this.storage.prepareSession({ id: crypto.randomUUID?.() || `rx-${Date.now()}` });
  }

  cancel(transferId, reason) {
    this.transport.cancelTransfer?.(transferId, reason);
    return this.storage.abort?.({ sessionId: transferId });
  }

  retry(transferId, fileId, offset, reason) {
    this.transport.retryTransfer?.(transferId, fileId, offset, reason);
  }

  bindTransport() {
    if (!this.transport?.on) return;
    this.transport.setChunkHandler?.((chunk) => this.handleChunk(chunk));
    this.cleanups.push(
      this.transport.on("manifest", (manifest) => this.handleManifest(manifest)),
      this.transport.on("complete", (event) => this.handleComplete(event)),
      this.transport.on("canceled", (event) => this.handleCanceled(event)),
      this.transport.on("failed", (event) => this.emit("failed", event)),
      this.transport.on("retry-requested", (event) => this.emit("retry-requested", event))
    );
  }

  async handleManifest(manifest) {
    if (!this.enabled) return;
    const state = {
      manifest,
      writeQueue: Promise.resolve(),
      fileIndexes: new Map()
    };
    this.incoming.set(manifest.id, state);
    try {
      await this.storage.estimateQuota(manifest.totalBytes);
      await this.storage.prepareSession({
        id: manifest.id,
        expectedBytes: manifest.totalBytes,
        metadata: { createdAt: manifest.createdAt }
      });
      for (const file of manifest.files) {
        await this.storage.prepareFile({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          hash: file.sha256 || null
        }, { sessionId: manifest.id });
        state.fileIndexes.set(file.id, 0);
      }
      this.transport.acknowledgeReceiverReady?.(manifest.id);
      this.emit("receive-ready", { transferId: manifest.id, manifest });
    } catch (error) {
      this.transport.cancelTransfer?.(manifest.id, error.message);
      this.emit("failed", { transferId: manifest.id, error, stage: "prepare-receive" });
    }
  }

  async handleChunk(chunk) {
    if (!this.enabled) return;
    const state = this.incoming.get(chunk.transferId);
    if (!state) {
      this.transport.retryTransfer?.(chunk.transferId, chunk.fileId, 0, "Storage manifest is not ready");
      return;
    }
    const index = state.fileIndexes.get(chunk.fileId) || 0;
    const write = state.writeQueue
      .then(() => this.storage.writeChunk(chunk.data, {
        sessionId: chunk.transferId,
        fileId: chunk.fileId,
        index,
        byteLength: chunk.size,
        transfer: true
      }));
    state.writeQueue = write;
    try {
      const progress = await write;
      state.fileIndexes.set(chunk.fileId, index + 1);
      this.emit("receive-progress", { ...progress, transferId: chunk.transferId });
    } catch (error) {
      state.writeQueue = Promise.resolve();
      this.emit("failed", { transferId: chunk.transferId, error, stage: "write-chunk" });
      throw error;
    }
  }

  async handleComplete(event) {
    if (!this.enabled || event.local !== false) return;
    const state = this.incoming.get(event.transferId);
    if (!state) return;
    try {
      await state.writeQueue;
      const result = await this.storage.finalize({ sessionId: event.transferId });
      this.transport.acknowledgeTransferComplete?.(event.transferId, {
        receivedBytes: result.receivedBytes
      });
      this.incoming.delete(event.transferId);
      this.emit("received", result);
    } catch (error) {
      this.transport.cancelTransfer?.(event.transferId, error.message);
      this.emit("failed", { transferId: event.transferId, error, stage: "finalize-receive" });
    }
  }

  async handleCanceled(event) {
    if (!this.enabled || !event.transferId) return;
    this.incoming.delete(event.transferId);
    await this.storage.abort?.({ sessionId: event.transferId }).catch(() => {});
    this.emit("canceled", event);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { Emitter } from "../utils/emitter.js?v=1.0.53";
import { IncrementalSha256 } from "../../workers/incremental-sha256.js?v=1.0.53";

export const DATA_CHANNEL_LABELS = Object.freeze({
  control: "webdrop-control-v1",
  file: "webdrop-file-v1"
});

const DEFAULT_CHUNK_SIZE = 256 * 1024;
const DEFAULT_HIGH_WATER_MARK = 8 * 1024 * 1024;
const DEFAULT_LOW_WATER_MARK = 2 * 1024 * 1024;
const DEFAULT_RECEIVER_READY_TIMEOUT = 45_000;
const DEFAULT_COMPLETION_TIMEOUT = 30 * 60_000;
const DEFAULT_SESSION_CAP_BYTES = 500 * 1024 * 1024;

export class DataChannelTransferProtocol extends Emitter {
  constructor({
    controlChannel = null,
    fileChannel = null,
    chunkSize = DEFAULT_CHUNK_SIZE,
    highWaterMark = DEFAULT_HIGH_WATER_MARK,
    lowWaterMark = DEFAULT_LOW_WATER_MARK,
    sessionCapBytes = DEFAULT_SESSION_CAP_BYTES
  } = {}) {
    super();
    this.chunkSize = chunkSize;
    this.highWaterMark = highWaterMark;
    this.lowWaterMark = lowWaterMark;
    this.sessionCapBytes = sessionCapBytes;
    this.controlChannel = null;
    this.fileChannel = null;
    this.outgoing = new Map();
    this.incoming = new Map();
    this.pendingChunkHeader = null;
    this.channelCleanups = new Map();
    this.receiveQueue = Promise.resolve();
    this.chunkHandler = null;

    if (controlChannel) this.attachChannel(controlChannel);
    if (fileChannel) this.attachChannel(fileChannel);
  }

  attachChannel(channel) {
    if (!channel) return;
    const kind = channel.label === DATA_CHANNEL_LABELS.control ? "control" : "file";
    const current = kind === "control" ? this.controlChannel : this.fileChannel;
    if (current === channel) return;
    if (current) this.detachChannel(current);

    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = this.lowWaterMark;
    if (kind === "control") this.controlChannel = channel;
    else this.fileChannel = channel;

    const onOpen = () => this.emit("channel-open", { kind, channel });
    const onClose = () => this.emit("channel-close", { kind, channel });
    const onError = (event) => this.emit("channel-error", { kind, event });
    const onMessage = (event) => {
      this.receiveQueue = this.receiveQueue
        .then(() => kind === "control"
          ? this.handleControlMessage(event.data)
          : this.handleFileMessage(event.data))
        .catch((error) => this.emit("protocol-error", { error }));
    };

    channel.addEventListener("open", onOpen);
    channel.addEventListener("close", onClose);
    channel.addEventListener("error", onError);
    channel.addEventListener("message", onMessage);
    this.channelCleanups.set(channel, () => {
      channel.removeEventListener("open", onOpen);
      channel.removeEventListener("close", onClose);
      channel.removeEventListener("error", onError);
      channel.removeEventListener("message", onMessage);
    });
  }

  detachChannel(channel) {
    this.channelCleanups.get(channel)?.();
    this.channelCleanups.delete(channel);
    if (this.controlChannel === channel) this.controlChannel = null;
    if (this.fileChannel === channel) this.fileChannel = null;
  }

  async ready({ timeoutMs = 15_000 } = {}) {
    await Promise.all([
      waitForOpen(this.controlChannel, timeoutMs),
      waitForOpen(this.fileChannel, timeoutMs)
    ]);
    return true;
  }

  setChunkHandler(handler) {
    this.chunkHandler = typeof handler === "function" ? handler : null;
  }

  async sendFiles(files, {
    transferId = createId("transfer"),
    onProgress,
    signal,
    retryFrom = {}
  } = {}) {
    await this.ready();
    if (signal?.aborted) throw abortError();
    const totalBytes = [...files].reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
    if (totalBytes > this.sessionCapBytes) {
      throw new Error(`Transfer exceeds the ${formatCap(this.sessionCapBytes)} session cap.`);
    }
    const manifest = await createManifest(transferId, files, this.chunkSize);
    if (manifest.totalBytes > this.sessionCapBytes) {
      throw new Error(`Transfer exceeds the ${formatCap(this.sessionCapBytes)} session cap.`);
    }
    const receiverReady = deferredWithTimeout(
      DEFAULT_RECEIVER_READY_TIMEOUT,
      "Timed out waiting for receiver storage readiness."
    );
    const state = {
      manifest,
      files: [...files],
      status: "sending",
      sentBytes: 0,
      acknowledgedBytes: 0,
      canceled: false,
      sequence: 0,
      completion: null,
      receiverReady
    };
    const onAbort = () => {
      state.canceled = true;
      state.status = "canceled";
      state.receiverReady?.reject(abortError());
      state.completion?.reject(abortError());
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
    this.outgoing.set(transferId, state);
    this.sendControl({ type: "transfer:manifest", manifest });

    try {
      await receiverReady.promise;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const descriptor = manifest.files[index];
        const startOffset = normalizeRetryOffset(retryFrom, descriptor);
        for (let offset = startOffset; offset < file.size; offset += this.chunkSize) {
          if (signal?.aborted || state.canceled) throw abortError();
          const chunk = await file.slice(offset, offset + this.chunkSize).arrayBuffer();
          const nextOffset = offset + chunk.byteLength;
          const header = {
            type: "file:chunk",
            transferId,
            fileId: descriptor.id,
            sequence: state.sequence,
            offset,
            size: chunk.byteLength,
            final: nextOffset >= file.size
          };
          await this.waitForBuffer(this.fileChannel, signal);
          this.fileChannel.send(JSON.stringify(header));
          this.fileChannel.send(chunk);
          state.sequence += 1;
          state.sentBytes += chunk.byteLength;
          const progress = transferProgress(manifest, descriptor, state.sentBytes, nextOffset);
          onProgress?.(progress);
          this.emit("progress", progress);
        }
      }
      state.status = "awaiting-completion-ack";
      const completion = deferredWithTimeout(
        DEFAULT_COMPLETION_TIMEOUT,
        "Timed out waiting for receiver completion verification."
      );
      state.completion = completion;
      this.sendControl({ type: "transfer:complete", transferId, totalBytes: manifest.totalBytes });
      this.emit("sent", { transferId, manifest });
      await completion.promise;
      this.outgoing.delete(transferId);
      return manifest;
    } catch (error) {
      state.status = error.name === "AbortError" ? "canceled" : "failed";
      this.sendControl({
        type: state.status === "canceled" ? "transfer:cancel" : "transfer:failed",
        transferId,
        reason: error.message
      });
      this.emit(state.status, { transferId, error });
      throw error;
    } finally {
      signal?.removeEventListener?.("abort", onAbort);
      this.outgoing.delete(transferId);
    }
  }

  cancel(transferId, reason = "Canceled by local peer") {
    const state = this.outgoing.get(transferId);
    if (state) {
      state.canceled = true;
      state.status = "canceled";
      state.completion?.reject(abortError());
      state.receiverReady?.reject(abortError());
      this.outgoing.delete(transferId);
    }
    this.sendControl({ type: "transfer:cancel", transferId, reason });
    this.emit("canceled", { transferId, reason, local: true });
  }

  fail(transferId, reason, retryable = true) {
    const state = this.outgoing.get(transferId);
    state?.completion?.reject(new Error(reason));
    state?.receiverReady?.reject(new Error(reason));
    this.outgoing.delete(transferId);
    this.sendControl({ type: "transfer:failed", transferId, reason, retryable });
    this.emit("failed", { transferId, reason, retryable, local: true });
  }

  requestRetry(transferId, fileId, offset = 0, reason = "Retry requested") {
    this.sendControl({ type: "transfer:retry", transferId, fileId, offset, reason });
    this.emit("retry-requested", { transferId, fileId, offset, reason, local: true });
  }

  acknowledgeCompletion(transferId, details = {}) {
    this.sendControl({ type: "transfer:ack", transferId, stage: "complete", ...details });
  }

  acknowledgeReceiverReady(transferId) {
    this.sendControl({ type: "transfer:ready", transferId });
  }

  sendControl(message) {
    if (this.controlChannel?.readyState !== "open") return false;
    this.controlChannel.send(JSON.stringify(message));
    return true;
  }

  async waitForBuffer(channel = this.fileChannel, signal) {
    if (!channel || channel.readyState !== "open") {
      throw new Error("Data channel is not open.");
    }
    if (signal?.aborted) throw abortError();
    if (channel.bufferedAmount <= this.highWaterMark) return;
    await new Promise((resolve, reject) => {
      const onLow = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error("Data channel closed while waiting for buffer capacity."));
      };
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      const cleanup = () => {
        channel.removeEventListener("bufferedamountlow", onLow);
        channel.removeEventListener("close", onClose);
        signal?.removeEventListener?.("abort", onAbort);
      };
      channel.addEventListener("bufferedamountlow", onLow, { once: true });
      channel.addEventListener("close", onClose, { once: true });
      signal?.addEventListener?.("abort", onAbort, { once: true });
    });
  }

  async handleControlMessage(raw) {
    const message = parseJson(raw);
    if (!message?.type) return;

    if (message.type === "transfer:manifest") {
      const { manifest } = message;
      if (!isValidManifest(manifest)) {
        const error = new Error("Received an invalid transfer manifest.");
        this.emit("protocol-error", { error, message });
        return;
      }
      if (manifest.totalBytes > this.sessionCapBytes) {
        this.sendControl({
          type: "transfer:failed",
          transferId: manifest.id,
          reason: `Transfer exceeds the ${formatCap(this.sessionCapBytes)} receive session cap.`,
          retryable: false
        });
        this.emit("failed", {
          transferId: manifest.id,
          error: new Error("Incoming transfer exceeds the receive session cap."),
          retryable: false,
          local: true,
          stage: "manifest-cap"
        });
        return;
      }
      this.incoming.set(manifest.id, {
        manifest,
        status: "receiving",
        receivedBytes: 0,
        fileOffsets: new Map()
      });
      this.sendControl({ type: "transfer:ack", transferId: manifest.id, stage: "manifest" });
      this.emit("manifest", manifest);
      return;
    }

    const state = this.incoming.get(message.transferId) || this.outgoing.get(message.transferId);
    switch (message.type) {
      case "transfer:ack":
        if (state && Number.isFinite(message.receivedBytes)) {
          state.acknowledgedBytes = Math.max(state.acknowledgedBytes || 0, message.receivedBytes);
        }
        if (message.stage === "complete" && state) {
          state.status = "complete";
          state.completion?.resolve(message);
          this.emit("complete", { ...message, local: true });
        }
        this.emit("ack", message);
        break;
      case "transfer:ready":
        if (state?.receiverReady) {
          state.receiverReady.resolve(message);
          this.emit("receiver-ready", message);
        }
        break;
      case "transfer:cancel":
        if (state) {
          state.canceled = true;
          state.status = "canceled";
        }
        this.emit("canceled", { ...message, local: false });
        this.outgoing.delete(message.transferId);
        this.incoming.delete(message.transferId);
        break;
      case "transfer:complete":
        if (!this.incoming.has(message.transferId)) {
          this.emit("protocol-error", {
            error: new Error("Completion received before a transfer manifest."),
            message
          });
        } else if (state.receivedBytes < state.manifest.totalBytes) {
          state.completionPending = message;
        } else {
          this.completeIncomingTransfer(message.transferId, message);
        }
        break;
      case "transfer:failed":
        if (state) state.status = "failed";
        state?.completion?.reject(new Error(message.reason || "Remote transfer failed."));
        state?.receiverReady?.reject(new Error(message.reason || "Remote transfer failed."));
        this.emit("failed", { ...message, local: false });
        this.outgoing.delete(message.transferId);
        this.incoming.delete(message.transferId);
        break;
      case "transfer:retry":
        if (this.outgoing.has(message.transferId)) {
          this.resendRequestedRange(message).catch((error) => {
            this.fail(message.transferId, error.message, false);
          });
        }
        this.emit("retry-requested", { ...message, local: false });
        break;
      default:
        this.emit("control", message);
    }
  }

  async handleFileMessage(raw) {
    if (typeof raw === "string") {
      const header = parseJson(raw);
      if (header?.type !== "file:chunk") return;
      if (!isValidChunkHeader(header)) {
        this.emit("protocol-error", {
          error: new Error("Received an invalid file chunk header."),
          message: header
        });
        return;
      }
      if (this.pendingChunkHeader) {
        const stale = this.pendingChunkHeader;
        this.requestRetry(stale.transferId, stale.fileId, stale.offset, "Chunk payload was not received before the next header");
        this.emit("protocol-error", {
          error: new Error("Received a new file chunk header before the previous payload."),
          message: stale
        });
      }
      this.pendingChunkHeader = header;
      return;
    }

    const header = this.pendingChunkHeader;
    this.pendingChunkHeader = null;
    if (!header) throw new Error("Received a file payload without a chunk header.");
    const data = await normalizeBinaryPayload(raw);
    if (!(data instanceof ArrayBuffer) || data.byteLength !== header.size) {
      this.requestRetry(header.transferId, header.fileId, header.offset, "Chunk size mismatch");
      return;
    }
    const chunkByteLength = data.byteLength;

    const state = this.incoming.get(header.transferId);
    if (!state) {
      this.requestRetry(header.transferId, header.fileId, header.offset, "Manifest not received");
      return;
    }
    const expectedOffset = state.fileOffsets.get(header.fileId) || 0;
    if (header.offset !== expectedOffset) {
      this.requestRetry(header.transferId, header.fileId, expectedOffset, "Unexpected chunk offset");
      return;
    }

    const chunkEvent = { ...header, data };
    try {
      await this.chunkHandler?.(chunkEvent);
    } catch (error) {
      this.requestRetry(header.transferId, header.fileId, header.offset, error.message);
      this.emit("failed", {
        transferId: header.transferId,
        fileId: header.fileId,
        error,
        retryable: true,
        stage: "persist-chunk"
      });
      return;
    }

    const nextOffset = header.offset + chunkByteLength;
    state.fileOffsets.set(header.fileId, nextOffset);
    state.receivedBytes += chunkByteLength;
    const file = state.manifest.files.find((candidate) => candidate.id === header.fileId);
    const progress = transferProgress(state.manifest, file, state.receivedBytes, nextOffset);
    this.emit("chunk", chunkEvent);
    this.emit("progress", progress);
    this.sendControl({
      type: "transfer:ack",
      transferId: header.transferId,
      fileId: header.fileId,
      offset: nextOffset,
      receivedBytes: state.receivedBytes,
      sequence: header.sequence,
      stage: header.final ? "file" : "chunk"
    });
    if (state.completionPending && state.receivedBytes >= state.manifest.totalBytes) {
      this.completeIncomingTransfer(header.transferId, state.completionPending);
    }
  }

  completeIncomingTransfer(transferId, message = {}) {
    const state = this.incoming.get(transferId);
    if (state) {
      state.status = "complete";
      state.completionPending = null;
    }
    this.emit("complete", { ...message, transferId, local: false });
    this.incoming.delete(transferId);
  }

  async resendRequestedRange(message) {
    const state = this.outgoing.get(message.transferId);
    const fileIndex = state?.manifest.files.findIndex((file) => file.id === message.fileId);
    if (!state || fileIndex == null || fileIndex < 0) return;
    const file = state.files[fileIndex];
    const descriptor = state.manifest.files[fileIndex];
    const startOffset = normalizeRetryOffset({ [descriptor.id]: message.offset }, descriptor);
    for (let offset = startOffset; offset < file.size; offset += this.chunkSize) {
      if (state.canceled) throw abortError();
      const chunk = await file.slice(offset, offset + this.chunkSize).arrayBuffer();
      const nextOffset = offset + chunk.byteLength;
      await this.waitForBuffer(this.fileChannel);
      this.fileChannel.send(JSON.stringify({
        type: "file:chunk",
        transferId: message.transferId,
        fileId: descriptor.id,
        sequence: state.sequence,
        offset,
        size: chunk.byteLength,
        final: nextOffset >= file.size,
        retry: true
      }));
      this.fileChannel.send(chunk);
      state.sequence += 1;
    }
    this.sendControl({ type: "transfer:complete", transferId: message.transferId, totalBytes: state.manifest.totalBytes });
  }

  close({ closeChannels = false } = {}) {
    for (const channel of [...this.channelCleanups.keys()]) {
      this.detachChannel(channel);
      if (closeChannels) {
        try {
          channel.close();
        } catch {
          // Channel closure is best-effort during transport cleanup.
        }
      }
    }
    this.outgoing.clear();
    this.incoming.clear();
    this.pendingChunkHeader = null;
  }
}

function formatCap(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

async function createManifest(transferId, files, chunkSize) {
  const descriptors = [];
  for (const [index, file] of [...files].entries()) {
    descriptors.push({
      id: createId(`file-${index}`),
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      lastModified: file.lastModified || null,
      sha256: await hashFile(file, chunkSize)
    });
  }
  return {
    version: 1,
    id: transferId,
    createdAt: new Date().toISOString(),
    totalBytes: descriptors.reduce((sum, file) => sum + file.size, 0),
    files: descriptors
  };
}

function isValidManifest(manifest) {
  return Boolean(
    manifest
    && typeof manifest.id === "string"
    && Number.isFinite(manifest.totalBytes)
    && manifest.totalBytes >= 0
    && Array.isArray(manifest.files)
    && manifest.files.every((file) =>
      typeof file?.id === "string"
      && typeof file?.name === "string"
      && Number.isFinite(file?.size)
      && file.size >= 0
      && /^[a-f0-9]{64}$/i.test(file.sha256 || ""))
    && manifest.files.reduce((sum, file) => sum + file.size, 0) === manifest.totalBytes
  );
}

function isValidChunkHeader(header) {
  return Boolean(
    header
    && header.type === "file:chunk"
    && typeof header.transferId === "string"
    && typeof header.fileId === "string"
    && Number.isSafeInteger(header.sequence)
    && header.sequence >= 0
    && Number.isSafeInteger(header.offset)
    && header.offset >= 0
    && Number.isSafeInteger(header.size)
    && header.size > 0
  );
}

async function normalizeBinaryPayload(raw) {
  if (raw instanceof Blob) return raw.arrayBuffer();
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  }
  return raw;
}

function transferProgress(manifest, file, transferredBytes, fileBytes) {
  return {
    transferId: manifest.id,
    fileId: file?.id,
    name: file?.name,
    transferredBytes,
    totalBytes: manifest.totalBytes,
    fileBytes,
    fileSize: file?.size,
    ratio: manifest.totalBytes ? transferredBytes / manifest.totalBytes : 1
  };
}

function normalizeRetryOffset(retryFrom, descriptor) {
  const offset = retryFrom[descriptor.id] ?? retryFrom[descriptor.name] ?? 0;
  return Number.isFinite(offset) && offset >= 0 && offset < descriptor.size ? offset : 0;
}

function parseJson(raw) {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function waitForOpen(channel, timeoutMs) {
  if (!channel) return Promise.reject(new Error("Required data channel is missing."));
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${channel.label} to open.`));
    }, timeoutMs);
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error(`${channel.label} closed before opening.`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      channel.removeEventListener("open", onOpen);
      channel.removeEventListener("close", onClose);
    };
    channel.addEventListener("open", onOpen, { once: true });
    channel.addEventListener("close", onClose, { once: true });
  });
}

function createId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function abortError() {
  if (typeof DOMException === "function") return new DOMException("Transfer canceled.", "AbortError");
  const error = new Error("Transfer canceled.");
  error.name = "AbortError";
  return error;
}

async function hashFile(file, chunkSize) {
  const hash = new IncrementalSha256();
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    hash.update(await file.slice(offset, offset + chunkSize).arrayBuffer());
    await Promise.resolve();
  }
  return hash.digestHex();
}

function deferredWithTimeout(timeoutMs, message) {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  return {
    promise,
    resolve(value) {
      clearTimeout(timer);
      resolve(value);
    },
    reject(error) {
      clearTimeout(timer);
      reject(error);
    }
  };
}

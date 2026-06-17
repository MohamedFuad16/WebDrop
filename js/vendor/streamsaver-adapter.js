let transporter = null;
let supportsTransferableStreamCache = null;

export function createStreamSaverAdapter({
  mitmUrl = new URL("../../vendor/streamsaver/mitm.html?version=2.0.6", import.meta.url).href
} = {}) {
  return {
    createWriteStream(filename, options = {}) {
      return createWriteStream(filename, { ...options, mitmUrl });
    }
  };
}

function createWriteStream(filename, { size = null, mitmUrl } = {}) {
  if (!isStreamSaverSupported()) {
    throw new Error("StreamSaver is not supported in this browser context.");
  }
  const channel = new MessageChannel();
  const supportsTransferable = supportsTransferableStream();
  const response = {
    transferringReadable: supportsTransferable,
    pathname: `${crypto.randomUUID?.() || Date.now()}/${encodeDownloadName(filename || "webdrop-file")}`,
    headers: {
      "Content-Type": "application/octet-stream; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeDownloadName(filename || "webdrop-file")}`
    }
  };
  if (Number.isFinite(size)) response.headers["Content-Length"] = String(size);

  ensureTransporter(mitmUrl).postMessage(response, "*", [channel.port2]);
  channel.port1.onmessage = (event) => {
    if (event.data?.download) makeIframe(event.data.download);
  };

  if (supportsTransferable) {
    const transform = new TransformStream();
    channel.port1.postMessage({ readableStream: transform.readable }, [transform.readable]);
    return transform.writable;
  }

  return new WritableStream({
    write(chunk) {
      if (!(chunk instanceof Uint8Array)) {
        throw new TypeError("StreamSaver fallback writes require Uint8Array chunks.");
      }
      channel.port1.postMessage(chunk);
    },
    close() {
      channel.port1.postMessage("end");
    },
    abort() {
      channel.port1.postMessage("abort");
    }
  });
}

export function isStreamSaverSupported() {
  if (!globalThis.isSecureContext && !["localhost", "127.0.0.1", "::1"].includes(location.hostname)) return false;
  if (!navigator.serviceWorker || !globalThis.WritableStream || !globalThis.ReadableStream) return false;
  try {
    new Response(new ReadableStream());
    return true;
  } catch {
    return false;
  }
}

function ensureTransporter(mitmUrl) {
  if (!transporter) transporter = makeIframe(mitmUrl);
  return transporter;
}

function makeIframe(src) {
  const iframe = document.createElement("iframe");
  const queuedMessages = [];
  iframe.hidden = true;
  iframe.src = src;
  iframe.name = "webdrop-stream-saver";
  iframe.loaded = false;
  iframe.postMessage = (...args) => {
    if (!iframe.loaded) {
      queuedMessages.push(args);
      return;
    }
    iframe.contentWindow.postMessage(...args);
  };
  iframe.addEventListener("load", () => {
    iframe.loaded = true;
    while (queuedMessages.length) iframe.contentWindow.postMessage(...queuedMessages.shift());
  }, { once: true });
  document.body.appendChild(iframe);
  return iframe;
}

function supportsTransferableStream() {
  if (supportsTransferableStreamCache != null) return supportsTransferableStreamCache;
  try {
    const { readable } = new TransformStream();
    const channel = new MessageChannel();
    channel.port1.postMessage(readable, [readable]);
    channel.port1.close();
    channel.port2.close();
    supportsTransferableStreamCache = true;
  } catch {
    supportsTransferableStreamCache = false;
  }
  return supportsTransferableStreamCache;
}

function encodeDownloadName(name) {
  return encodeURIComponent(String(name).replace(/\//g, ":"))
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}

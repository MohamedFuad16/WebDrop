let session = null;
let chunks = [];

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event.data;
  try {
    if (type === "prepare") {
      session = payload;
      chunks = [];
      respond(id, true, { session, backend: await detectBackend() });
      return;
    }
    if (type === "write") {
      chunks.push(payload);
      respond(id, true, { chunks: chunks.length });
      return;
    }
    if (type === "finalize") {
      respond(id, true, { session, chunks: chunks.length });
      return;
    }
    respond(id, false, null, `Unknown storage command: ${type}`);
  } catch (error) {
    respond(id, false, null, error.message);
  }
});

async function detectBackend() {
  if (navigator.storage?.getDirectory) return "opfs";
  if ("indexedDB" in self) return "indexeddb";
  return "memory";
}

function respond(id, ok, payload, error) {
  self.postMessage({ id, ok, payload, error });
}

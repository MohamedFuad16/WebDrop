export class TransferEngine {
  constructor({ storage }) {
    this.storage = storage;
  }

  async send(files, { onProgress }) {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let sentBytes = 0;
    for (const file of files) {
      const chunkSize = 64 * 1024;
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
    await this.storage.prepareSession({ id: crypto.randomUUID?.() || `rx-${Date.now()}` });
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

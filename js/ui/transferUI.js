export class TransferUI {
  constructor(elements) {
    this.progressBar = elements.progressBar;
    this.statusText = elements.statusText;
    this.fileSummary = elements.fileSummary;
  }

  updateProgress(percentage) {
    if (this.progressBar) {
      this.progressBar.style.width = `${percentage}%`;
    }
  }

  setStatus(message) {
    if (this.statusText) {
      this.statusText.textContent = message;
    }
  }

  setFileDetails(name, size) {
    if (this.fileSummary) {
      this.fileSummary.textContent = `${name} (${this.formatBytes(size)})`;
    }
  }

  formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }
}

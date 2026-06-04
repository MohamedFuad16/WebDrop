export class DynamicIslandQR {
  constructor(islandElement, bus) {
    this.island = islandElement;
    this.bus = bus;
    this.video = document.getElementById('qr-video');
    this.stream = null;
    this.active = false;
  }

  showCreateCode(sessionId) {
    this.island.classList.add('active');
    this.active = true;
    // In real implementation, generate QR code with a library like qrcode.js
    // and render it into the island content
    this.island.querySelector('.qr-overlay p').textContent = `Session: ${sessionId}`;
  }

  async showScanCode() {
    this.island.classList.add('active');
    this.active = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      this.video.srcObject = this.stream;
      
      // Real implementation would run jsQR inside a requestAnimationFrame loop
      // to decode the video frames.
    } catch (err) {
      console.error("Camera access denied.", err);
    }
  }

  close() {
    this.island.classList.remove('active');
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  }
}

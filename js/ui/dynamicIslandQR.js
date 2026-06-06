export class DynamicIslandQR {
  constructor(islandElement, bus) {
    this.island = islandElement;
    this.bus = bus;
    this.video = document.getElementById('qr-video');
    this.stream = null;
    this.active = false;
    this.transitionTimer = null;
  }

  reveal() {
    clearTimeout(this.transitionTimer);
    this.island.classList.remove('active', 'island-closing');
    this.island.classList.add('island-opening');
    void this.island.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.island.classList.add('active');
      this.island.classList.remove('island-opening');
    }));
  }

  showCreateCode(sessionId) {
    this.reveal();
    this.active = true;
    // In real implementation, generate QR code with a library like qrcode.js
    // and render it into the island content
    this.island.querySelector('.qr-overlay p').textContent = `Session: ${sessionId}`;
  }

  async showScanCode() {
    this.reveal();
    this.active = true;
    document.body.classList.add('qr-scanning');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640, max: 960 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 20 }
        }
      });
      this.video.srcObject = this.stream;
      
      // Real implementation would run jsQR inside a requestAnimationFrame loop
      // to decode the video frames.
    } catch (err) {
      console.error("Camera access denied.", err);
      this.close();
    }
  }

  close() {
    clearTimeout(this.transitionTimer);
    this.island.classList.remove('active', 'island-opening');
    this.island.classList.add('island-closing');
    this.transitionTimer = setTimeout(() => {
      this.island.classList.remove('island-closing');
    }, 1120);
    this.active = false;
    document.body.classList.remove('qr-scanning');
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  }
}

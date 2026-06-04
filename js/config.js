export const CONFIG = {
  signalingUrl: "wss://webdrop-signaling.vercel.app/", // Replace with actual URL
  proximityThreshold: 70, // 70+ means handshake ready
  chunkSize: 16 * 1024,
  scoring: {
    ultrasound: 50,
    network: 20,
    bump: 15,
    tilt: 15,
    chime: 20
  }
};

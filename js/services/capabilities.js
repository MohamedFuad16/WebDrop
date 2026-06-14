export async function detectCapabilities() {
  const secure = window.isSecureContext;
  const microphone = Boolean(navigator.mediaDevices?.getUserMedia) && secure;
  const DeviceMotion = window.DeviceMotionEvent;
  const motion = Boolean(DeviceMotion);
  const motionPermission = typeof DeviceMotion?.requestPermission === "function";
  const webRtc = "RTCPeerConnection" in window && "RTCDataChannel" in window;
  const opfs = Boolean(navigator.storage?.getDirectory);
  const indexedDb = "indexedDB" in window;
  const worker = "Worker" in window;

  return {
    microphone,
    websocket: "WebSocket" in window,
    motion,
    motionPermission,
    bump: motion,
    ultra: microphone,
    webRtc,
    opfs,
    indexedDb,
    worker,
    secure
  };
}

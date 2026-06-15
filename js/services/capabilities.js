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
  const platform = detectPlatform();

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
    secure,
    camera: Boolean(navigator.mediaDevices?.getUserMedia) && secure,
    qrScanner: "BarcodeDetector" in window,
    platform
  };
}

function detectPlatform() {
  const userAgent = navigator.userAgent || "";
  const platformName = navigator.userAgentData?.platform || navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent)
    || (/Mac/i.test(platformName) && maxTouchPoints > 1);
  const isIPhone = /iPhone/i.test(userAgent);
  return {
    family: isIOS ? "ios" : /Android/i.test(userAgent) ? "android" : "desktop",
    isIOS,
    isIPhone,
    dynamicIslandCapable: isIPhone && screen.width >= 393 && screen.height >= 852
  };
}

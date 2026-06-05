function resolveSignalingUrl() {
  const queryOverride = new URLSearchParams(window.location.search).get("ws");
  const storedOverride = localStorage.getItem("webdrop-signaling-url");
  const explicitOverride = window.WEBDROP_SIGNALING_URL;

  if (explicitOverride || queryOverride || storedOverride) {
    return explicitOverride || queryOverride || storedOverride;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export const CONFIG = {
  signalingUrl: resolveSignalingUrl(),
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

const DEFAULTS = Object.freeze({
  productionSignaling: false,
  realProximityCeremony: false,
  realTransfer: false,
  qrPairing: false,
  signalingUrl: "",
  turnConfigUrl: ""
});

export function getRuntimeFlags() {
  const injected = globalThis.WEBDROP_RUNTIME_CONFIG || {};
  const signalingUrl = safeUrl(injected.signalingUrl, ["wss:", "ws:"]);
  const turnConfigUrl = safeUrl(injected.turnConfigUrl, ["https:", "http:"]);
  const productionSignaling = injected.productionSignaling === true && Boolean(signalingUrl);
  return {
    productionSignaling,
    realProximityCeremony: productionSignaling && injected.realProximityCeremony === true,
    realTransfer: productionSignaling && injected.realTransfer === true,
    qrPairing: productionSignaling && injected.qrPairing === true,
    signalingUrl,
    turnConfigUrl,
    defaults: DEFAULTS
  };
}

function safeUrl(value, allowedProtocols) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, location.href);
    if (!allowedProtocols.includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

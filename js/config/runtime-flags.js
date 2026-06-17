const DEFAULTS = Object.freeze({
  productionSignaling: false,
  realProximityCeremony: false,
  realTransfer: false,
  qrPairing: false,
  signalingUrl: "",
  turnConfigUrl: ""
});

export function getRuntimeFlags() {
  if (isLocalQaMockRuntime()) return { ...DEFAULTS, defaults: DEFAULTS };
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

function isLocalQaMockRuntime() {
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!localHost) return false;
  return new URLSearchParams(location.search).get("runtime") === "mock";
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

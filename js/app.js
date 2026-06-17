import { createStore } from "./core/state.js";
import { createController } from "./core/controller.js?v=1.0.27";
import { detectCapabilities } from "./services/capabilities.js";
import { MockSignalingAdapter } from "./services/mock-signaling.js?v=1.0.27";
import { WebSocketSignalingAdapter } from "./services/websocket-signaling.js";
import { TurnConfigProvider } from "./services/turn-config.js";
import { ProximityEngine } from "./services/proximity-engine.js";
import { WebRtcTransport } from "./services/webrtc-transport.js";
import { TransferEngine } from "./services/transfer-engine.js";
import { StorageClient } from "./storage/storage-client.js";
import { AppView } from "./ui/app-view.js?v=1.0.27";
import { AVATAR_OPTIONS, normalizeAvatarChoice } from "./config/avatar-options.js";
import { getRuntimeFlags } from "./config/runtime-flags.js";

function browserLocale() {
  const storedLocale = localStorage.getItem("webdrop.locale");
  if (storedLocale === "en" || storedLocale === "ja") return storedLocale;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const primary = languages
    .map((language) => String(language || "").toLowerCase().split("-")[0])
    .find((language) => language === "en" || language === "ja");
  return primary || "en";
}

const initialState = {
  mode: "lobby",
  self: {
    id: persistentDeviceId(),
    name: localStorage.getItem("webdrop.deviceName") || defaultDeviceName(),
    avatar: normalizeAvatarChoice(localStorage.getItem("webdrop.avatarChoice")) || AVATAR_OPTIONS[0],
    ringColor: localStorage.getItem("webdrop.ringColor") || "#ffffff",
    deviceFamily: selfDeviceFamily()
  },
  peers: [],
  selectedPeerId: null,
  connectedPeerId: null,
  files: [],
  transfer: null,
  capabilities: {},
  path: "unknown",
  pendingInviteId: null,
  incomingInvite: null,
  pairingId: null,
  receivedCount: 0,
  receivedItems: [],
  chatMessages: [],
  theme: localStorage.getItem("webdrop.theme") || "light",
  locale: browserLocale(),
  motionPaused: localStorage.getItem("webdrop.motionPaused") === "true"
};

const store = createStore(initialState);
const view = new AppView(document, store);
const runtime = getRuntimeFlags();

const mockSignaling = new MockSignalingAdapter();
const futureSignaling = new WebSocketSignalingAdapter({ url: runtime.signalingUrl });
const signaling = runtime.productionSignaling && runtime.signalingUrl
  ? futureSignaling
  : mockSignaling;
const turnConfig = new TurnConfigProvider({
  url: runtime.turnConfigUrl,
  enabled: runtime.productionSignaling && Boolean(runtime.turnConfigUrl),
  authorizationProvider: () => signaling.getTurnAuthorization?.()
});
const proximity = new ProximityEngine({ enabled: runtime.realProximityCeremony });
const transport = new WebRtcTransport({
  signaling,
  turnConfig,
  enabled: false
});
const storage = new StorageClient();
const transfer = new TransferEngine({ transport, storage, enabled: runtime.realTransfer });

createController({
  store,
  view,
  signaling,
  futureSignaling,
  proximity,
  transport,
  transfer,
  storage,
  runtime
});

detectCapabilities().then((capabilities) => {
  store.patch({ capabilities: { ...capabilities, runtime } });
  signaling.connect({ self: store.getState().self, capabilities });
  if (isLocalhost && new URLSearchParams(location.search).get("qa") === "incoming-invite") {
    window.setTimeout(() => mockSignaling.simulateIncomingInvite?.(), 900);
  }
});

const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
if ("serviceWorker" in navigator && !isLocalhost) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });
  navigator.serviceWorker.register("./service-worker.js")
    .then((registration) => registration.update())
    .catch(() => {});
}

function persistentDeviceId() {
  const stored = localStorage.getItem("webdrop.deviceId");
  if (stored) return stored;
  const id = crypto.randomUUID?.() || `self-${Date.now()}`;
  localStorage.setItem("webdrop.deviceId", id);
  return id;
}

function defaultDeviceName() {
  if (/iPhone/i.test(navigator.userAgent)) return "WebDrop iPhone";
  if (/iPad/i.test(navigator.userAgent)) return "WebDrop iPad";
  if (/Android/i.test(navigator.userAgent)) return "WebDrop Android";
  return "WebDrop Device";
}

function selfDeviceFamily() {
  if (/iPhone/i.test(navigator.userAgent)) return "ios";
  if (/iPad/i.test(navigator.userAgent)) return "ipad";
  if (/Android/i.test(navigator.userAgent)) return "android";
  if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) return "macos";
  if (/Windows/i.test(navigator.userAgent)) return "windows";
  return "unknown";
}

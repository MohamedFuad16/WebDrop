import { createStore } from "./core/state.js?v=1.0.91";
import { createController } from "./core/controller.js?v=1.0.91";
import { detectCapabilities } from "./services/capabilities.js?v=1.0.91";
import { MockSignalingAdapter } from "./services/mock-signaling.js?v=1.0.91";
import { WebSocketSignalingAdapter } from "./services/websocket-signaling.js?v=1.0.91";
import { TurnConfigProvider } from "./services/turn-config.js?v=1.0.91";
import { ProximityEngine } from "./services/proximity-engine.js?v=1.0.91";
import { WebRtcTransport } from "./services/webrtc-transport.js?v=1.0.91";
import { TransferEngine } from "./services/transfer-engine.js?v=1.0.91";
import { StorageClient } from "./storage/storage-client.js?v=1.0.91";
import { AppView } from "./ui/app-view.js?v=1.0.91";
import { randomAvatarChoice, normalizeAvatarChoice } from "./config/avatar-options.js?v=1.0.91";
import { getRuntimeFlags } from "./config/runtime-flags.js?v=1.0.91";

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
    id: persistentClientId(),
    deviceId: persistentDeviceId(),
    name: localStorage.getItem("webdrop.deviceName") || defaultDeviceName(),
    avatar: cachedAvatarChoice(),
    avatarId: cachedAvatarChoice(),
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
  unreadChatCount: 0,
  signalingStatus: "connecting",
  theme: localStorage.getItem("webdrop.theme") || "light",
  locale: browserLocale(),
  motionPaused: localStorage.getItem("webdrop.motionPaused") === "true"
};

const store = createStore(initialState);
const view = new AppView(document, store);
const runtime = getRuntimeFlags();
const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const query = new URLSearchParams(location.search);

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

document.querySelector("#app")?.setAttribute("data-ready", "true");

detectCapabilities().then((capabilities) => {
  store.patch({ capabilities: { ...capabilities, runtime } });
  signaling.connect({ self: store.getState().self, capabilities });
  if (isLocalhost && query.get("qa") === "incoming-invite") {
    window.setTimeout(() => mockSignaling.simulateIncomingInvite?.(), 900);
  }
});

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

window.addEventListener("pagehide", () => {
  signaling.disconnect?.();
  storage.cleanupAll?.().catch(() => {});
});

function persistentClientId() {
  const stored = sessionStorage.getItem("webdrop.clientId");
  if (stored) return stored;
  const stableDeviceId = persistentDeviceId();
  const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const id = `${stableDeviceId}-${suffix}`;
  sessionStorage.setItem("webdrop.clientId", id);
  return id;
}

function cachedAvatarChoice() {
  const stored = localStorage.getItem("webdrop.avatarChoice");
  if (stored) return normalizeAvatarChoice(stored);
  const avatar = randomAvatarChoice();
  localStorage.setItem("webdrop.avatarChoice", avatar);
  return avatar;
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

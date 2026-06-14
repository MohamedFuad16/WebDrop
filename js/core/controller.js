import { formatBytes } from "../utils/format.js";

export function createController({
  store,
  view,
  signaling,
  futureSignaling,
  proximity,
  transport,
  transfer
}) {
  let activePeerId = null;

  signaling.on("connected", () => {});

  signaling.on("peers", (peers) => {
    store.patch({ peers });
  });

  signaling.on("inviteAccepted", ({ peerId }) => {
    const peer = findPeer(peerId);
    activePeerId = peerId;
    store.patch({
      mode: "intent",
      selectedPeerId: peerId,
      pendingInviteId: peerId
    });
    view.toast(view.translate("acceptedToast", { name: peer.name }));
    view.openPeerSheet(peer, { peers: store.getState().peers });
  });

  view.on("settings", () => view.openSettings());
  view.on("close-settings", () => view.closeSettings());
  view.on("open-information", () => view.openInformation());
  view.on("back-to-settings", () => view.backToSettings());
  view.on("close-information", () => view.closeInformation());
  view.on("close-sheet", () => view.closePeerSheet());
  view.on("close-action-sheet", () => view.closeActionSheets());
  view.on("close-all-sheets", () => view.closeAllSheets());
  view.on("open-send-sheet", () => view.openSendSheet());
  view.on("open-receive-sheet", () => view.openReceiveSheet());
  view.on("open-chat-sheet", () => view.openChatSheet());
  view.on("toggle-theme", () => {
    const nextTheme = store.getState().theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });
  view.on("set-theme-light", () => setTheme("light"));
  view.on("set-theme-dark", () => setTheme("dark"));
  view.on("set-language-en", () => setLocale("en"));
  view.on("set-language-ja", () => setLocale("ja"));
  view.on("set-motion-on", () => setMotionPaused(false));
  view.on("set-motion-paused", () => setMotionPaused(true));
  view.on("select-avatar", (avatar) => {
    if (!avatar?.startsWith("assets/icons/avatars/")) return;
    localStorage.setItem("webdrop.avatarChoice", avatar);
    store.update((state) => ({ ...state, self: { ...state.self, avatar } }));
  });
  view.on("select-ring", (ringColor) => {
    if (!/^#[0-9a-f]{6}$/i.test(ringColor || "")) return;
    localStorage.setItem("webdrop.ringColor", ringColor);
    store.update((state) => ({ ...state, self: { ...state.self, ringColor } }));
  });

  view.on("name-change", (name) => {
    const clean = name.slice(0, 22);
    if (clean.trim()) {
      localStorage.setItem("webdrop.deviceName", clean);
    } else {
      localStorage.removeItem("webdrop.deviceName");
    }
    store.update((state) => ({ ...state, self: { ...state.self, name: clean } }));
  });

  view.on("peer-select", (peerId) => {
    const { connectedPeerId } = store.getState();
    if (connectedPeerId) {
      const connectedPeer = findPeer(connectedPeerId);
      view.toast(
        connectedPeerId === peerId
          ? view.translate("alreadyConnected", { name: connectedPeer.name })
          : view.translate("disconnectFirst", { name: connectedPeer.name })
      );
      return;
    }
    const peer = findPeer(peerId);
    activePeerId = peerId;
    store.patch({ selectedPeerId: peerId });
    view.openPeerSheet(peer, { peers: store.getState().peers });
  });

  view.on("swipe-connect", async () => {
    if (!activePeerId) return;
    const currentPeerId = store.getState().connectedPeerId;
    if (currentPeerId && currentPeerId !== activePeerId) {
      view.closePeerSheet();
      view.toast(view.translate("oneConnection"));
      return;
    }
    const peer = findPeer(activePeerId);
    store.patch({ mode: "verifying", pendingInviteId: activePeerId });
    view.closePeerSheet();
    const result = await proximity.runCeremony({ peer, capabilities: store.getState().capabilities });
    await signaling.sendProximityTelemetry(activePeerId, result.metrics);
    if (!result.passed) {
      store.patch({ mode: "lobby", pendingInviteId: null });
      view.toast(view.translate("qrFallback"));
      return;
    }
    const path = await transport.preflight(activePeerId);
    store.patch({
      mode: "connected",
      connectedPeerId: activePeerId,
      path,
      receivedCount: 1,
      receivedItems: demoPdfItems(),
      peers: store.getState().peers.map((candidate) =>
        candidate.id === activePeerId ? { ...candidate, stage: "near" } : candidate
      )
    });
  });

  view.on("choose-files", () => view.openFilePicker());

  view.on("files-selected", (files) => {
    const limited = [...files];
    const totalBytes = limited.reduce((sum, file) => sum + file.size, 0);
    const relayLimit = 500 * 1024 * 1024;
    if (store.getState().path === "relay" && totalBytes > relayLimit) {
      view.toast(view.translate("relayLimit"));
      return;
    }
    store.patch({ files: limited });
    view.toast(view.translate(limited.length === 1 ? "oneFileSelected" : "filesSelected", {
      count: limited.length,
      size: formatBytes(totalBytes)
    }));
    view.openSendSheet();
  });

  async function sendSelectedFiles() {
    const { files, connectedPeerId, transfer: activeTransfer } = store.getState();
    if (!connectedPeerId) {
      view.toast(view.translate("connectFirst"));
      return;
    }
    if (activeTransfer) return;
    if (!files.length) {
      view.openFilePicker();
      return;
    }
    await transfer.send(files, {
      onProgress(progress) {
        store.patch({ transfer: progress });
      }
    });
    const receivedItems = files.slice(0, 3).map((file) => ({
      name: file.name,
      size: formatBytes(file.size),
      icon: file.type?.includes("pdf") ? "P" : file.type?.startsWith("image/") ? "◎" : "⌁"
    }));
    const existing = store.getState().receivedItems;
    store.patch({
      transfer: null,
      files: [],
      receivedCount: Math.max(store.getState().receivedCount, receivedItems.length || 1),
      receivedItems: receivedItems.length ? [...existing, ...receivedItems] : existing
    });
    view.closeActionSheets();
    view.toast(view.translate("transferComplete"));
  }

  view.on("send", sendSelectedFiles);
  view.on("swipe-send", sendSelectedFiles);

  view.on("send-chat", () => {
    const message = view.takeChatMessage();
    if (!message) return;
    const peerId = store.getState().connectedPeerId;
    store.update((state) => ({
      ...state,
      chatMessages: [
        ...state.chatMessages,
        { id: crypto.randomUUID?.() || `msg-${Date.now()}`, author: "self", text: message }
      ]
    }));
    window.setTimeout(() => {
      const state = store.getState();
      if (!peerId || state.connectedPeerId !== peerId || state.mode !== "connected") return;
      store.update((current) => ({
        ...current,
        chatMessages: [
          ...current.chatMessages,
          {
            id: crypto.randomUUID?.() || `reply-${Date.now()}`,
            author: "peer",
            text: view.translate("mockReply")
          }
        ]
      }));
    }, 560);
  });

  view.on("disconnect", async () => {
    const current = store.getState();
    if (!current.connectedPeerId || current.mode === "disconnecting") return;
    store.patch({ mode: "disconnecting", transfer: null });
    view.closeAllSheets();
    view.toast(view.translate("disconnecting"));
    await wait(920);
    transport.close?.();
    await signaling.disconnectPeer(current.connectedPeerId);
    store.patch({
      mode: "lobby",
      connectedPeerId: null,
      selectedPeerId: null,
      pendingInviteId: null,
      files: [],
      transfer: null,
      path: "unknown",
      receivedCount: 0,
      receivedItems: [],
      chatMessages: []
    });
    activePeerId = null;
    view.toast(view.translate("disconnected"));
  });

  view.on("qr-fallback", () => {
    view.toast(view.translate("qrInfo"));
  });

  function findPeer(peerId) {
    return store.getState().peers.find((peer) => peer.id === peerId);
  }

  function setTheme(theme) {
    localStorage.setItem("webdrop.theme", theme);
    view.transitionUpdate(() => store.patch({ theme }));
  }

  function setLocale(locale) {
    localStorage.setItem("webdrop.locale", locale);
    view.transitionUpdate(() => store.patch({ locale }));
  }

  function setMotionPaused(motionPaused) {
    localStorage.setItem("webdrop.motionPaused", String(motionPaused));
    store.patch({ motionPaused });
  }
}

function demoPdfItems() {
  return [
    {
      name: "WebDrop Demo Guide EN.pdf",
      size: "Demo PDF",
      icon: "P",
      locale: "en",
      url: "output/pdf/webdrop-demo-en.pdf"
    },
    {
      name: "WebDrop デモガイド JP.pdf",
      size: "デモPDF",
      icon: "P",
      locale: "ja",
      url: "output/pdf/webdrop-demo-ja.pdf"
    }
  ];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

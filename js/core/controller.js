import { formatBytes } from "../utils/format.js";

export function createController({
  store,
  view,
  signaling,
  futureSignaling,
  proximity,
  transport,
  transfer,
  runtime = {}
}) {
  let activePeerId = null;
  let incomingInvite = null;
  const pairingWaiters = new Map();
  const proximityDecisionWaiters = new Map();
  const proximityStartWaiters = new Map();
  const qrIssuedWaiters = new Map();
  const qrVerifiedWaiters = new Map();
  let qrScanResolver = null;
  let qrCancelResolver = null;
  let qrFallbackResolver = null;

  signaling.on("connected", () => {});

  signaling.on("disconnected", () => {
    if (!runtime.productionSignaling) return;
    transport.close?.();
    resolveQrCancellation();
    clearVerificationWaiters();
    store.patch({
      mode: "lobby",
      connectedPeerId: null,
      selectedPeerId: null,
      pendingInviteId: null,
      incomingInvite: null,
      pairingId: null,
      files: [],
      transfer: null,
      path: "unknown",
      chatMessages: []
    });
    activePeerId = null;
    incomingInvite = null;
    view.closeDynamicIsland();
    view.toast(view.translate("signalingLost"));
  });

  signaling.on("route:error", (payload = {}) => {
    if (payload.targetId) {
      pairingWaiters.get(payload.targetId)?.(null);
      pairingWaiters.delete(payload.targetId);
    }
    const pairingId = store.getState().pairingId;
    if (pairingId && payload.type?.startsWith("proximity:qr:")) {
      qrIssuedWaiters.get(pairingId)?.(null);
      qrIssuedWaiters.delete(pairingId);
      qrVerifiedWaiters.get(pairingId)?.(null);
      qrVerifiedWaiters.delete(pairingId);
    }
    view.toast(view.translate("connectionRejected"));
  });

  signaling.on("peers", (peers) => {
    store.patch({ peers });
  });

  signaling.on("inviteAccepted", ({ peerId, pairingId }) => {
    const peer = findPeer(peerId);
    if (!peer) {
      pairingWaiters.get(peerId)?.(null);
      pairingWaiters.delete(peerId);
      view.toast(view.translate("connectionRejected"));
      return;
    }
    const wasVerifying = store.getState().mode === "verifying";
    activePeerId = peerId;
    store.patch({
      mode: wasVerifying ? "verifying" : "intent",
      selectedPeerId: peerId,
      pendingInviteId: peerId,
      incomingInvite: null,
      pairingId: pairingId || null
    });
    pairingWaiters.get(peerId)?.({ peerId, pairingId });
    pairingWaiters.delete(peerId);
    if (runtime.realTransfer) transport.enable({ peerId, pairingId });
    if (!wasVerifying) {
      view.toast(view.translate("acceptedToast", { name: peer.name }));
      view.openPeerSheet(peer, { peers: store.getState().peers });
    }
  });

  signaling.on("invite", (payload) => {
    const peerId = payload?.fromId;
    const peer = store.getState().peers.find((candidate) => candidate.id === peerId) || payload?.from;
    if (!peerId || !peer) return;
    const state = store.getState();
    if (state.connectedPeerId || state.mode === "verifying" || state.mode === "disconnecting") {
      signaling.rejectInvite?.(peerId, payload.pairingId);
      view.toast(view.translate("inviteDeclinedBusy", { name: peer.name }));
      return;
    }
    incomingInvite = {
      peerId,
      pairingId: payload.pairingId || null,
      receivedAt: payload.receivedAt || new Date().toISOString(),
      from: peer
    };
    activePeerId = peerId;
    store.patch({
      mode: "lobby",
      selectedPeerId: peerId,
      pendingInviteId: peerId,
      incomingInvite,
      pairingId: payload.pairingId || null
    });
    view.openPeerSheet(peer, { peers: store.getState().peers, direction: "incoming" });
    view.toast(view.translate("incomingInviteToast", { name: peer.name }));
  });

  signaling.on("invite:reject", (payload = {}) => {
    handleInviteRejected(payload);
  });

  signaling.on("inviteRejected", (payload = {}) => {
    handleInviteRejected(payload);
  });

  signaling.on("chat:message", (payload) => {
    const message = payload?.payload || payload;
    if (!message?.text) return;
    store.update((state) => ({
      ...state,
      chatMessages: [
        ...state.chatMessages,
        { id: message.id || `remote-${Date.now()}`, author: "peer", text: message.text }
      ]
    }));
  });

  signaling.on("proximity:decision", (payload) => {
    if (!payload?.pairVerified || !payload.pairingId) return;
    proximityDecisionWaiters.get(payload.pairingId)?.(payload);
    proximityDecisionWaiters.delete(payload.pairingId);
  });

  signaling.on("proximity:start", (payload) => {
    if (!payload?.pairingId || !payload?.startAt) return;
    proximityStartWaiters.get(payload.pairingId)?.(payload);
    proximityStartWaiters.delete(payload.pairingId);
  });

  signaling.on("proximity:qr:issued", (payload) => {
    if (!payload?.pairingId || !payload?.token) return;
    qrIssuedWaiters.get(payload.pairingId)?.(payload);
    qrIssuedWaiters.delete(payload.pairingId);
  });

  signaling.on("proximity:qr:verified", (payload) => {
    if (!payload?.pairingId) return;
    qrVerifiedWaiters.get(payload.pairingId)?.(payload);
    qrVerifiedWaiters.delete(payload.pairingId);
    if (payload.valid) view.markIslandQrSuccess();
  });

  signaling.on("proximity:fallback", () => {
    qrFallbackResolver?.();
    qrFallbackResolver = null;
    view.closeDynamicIsland();
  });

  signaling.on("peerDisconnected", ({ peerId, pairingId } = {}) => {
    const state = store.getState();
    const relevantPeerId = state.connectedPeerId || state.pendingInviteId || activePeerId;
    const relevantPairingId = state.pairingId;
    if (!relevantPeerId && !relevantPairingId) return;
    if (peerId && relevantPeerId && relevantPeerId !== peerId) return;
    if (pairingId && relevantPairingId && relevantPairingId !== pairingId) return;
    transport.close?.();
    store.patch({
      mode: "lobby",
      connectedPeerId: null,
      selectedPeerId: null,
      pendingInviteId: null,
      incomingInvite: null,
      pairingId: null,
      files: [],
      transfer: null,
      path: "unknown",
      chatMessages: []
    });
    activePeerId = null;
    resolveQrCancellation();
    clearVerificationWaiters();
    view.closeDynamicIsland();
    view.toast(view.translate("disconnected"));
  });

  transfer.on?.("received", (result) => {
    const receivedItems = (result.files || []).map((file) => ({
      id: file.fileId,
      transferId: result.sessionId,
      name: file.name,
      size: formatBytes(file.receivedBytes),
      icon: file.type?.includes("pdf") ? "P" : file.type?.startsWith("image/") ? "◎" : "⌁",
      storageBackend: file.backend,
      sha256: file.sha256,
      ready: true
    }));
    store.update((state) => ({
      ...state,
      receivedCount: state.receivedCount + receivedItems.length,
      receivedItems: [...state.receivedItems, ...receivedItems],
      transfer: null
    }));
  });

  transfer.on?.("receive-progress", (progress) => {
    store.patch({ transfer: { ...progress, direction: "receive" } });
  });

  transfer.on?.("failed", () => {
    store.patch({ transfer: null });
  });

  transfer.on?.("canceled", () => {
    store.patch({ transfer: null });
  });

  view.on("settings", () => view.openSettings());
  view.on("close-settings", () => view.closeSettings());
  view.on("open-information", () => view.openInformation());
  view.on("back-to-settings", () => view.backToSettings());
  view.on("close-information", () => view.closeInformation());
  view.on("open-nearby-sheet", () => view.openNearbySheet());
  view.on("close-nearby-sheet", () => view.closeNearbySheet());
  view.on("toggle-qr-preview", () => view.toggleQrScannerPreview());
  view.on("close-sheet", async () => {
    if (incomingInvite?.peerId) {
      const invite = incomingInvite;
      clearIncomingInvite();
      await signaling.rejectInvite?.(invite.peerId, invite.pairingId);
      await view.closePeerSheet();
      view.toast(view.translate("inviteDeclined"));
      return;
    }
    view.closePeerSheet();
  });
  view.on("close-action-sheet", () => view.closeActionSheets());
  view.on("close-all-sheets", async () => {
    if (incomingInvite?.peerId) {
      const invite = incomingInvite;
      clearIncomingInvite();
      await signaling.rejectInvite?.(invite.peerId, invite.pairingId);
      await view.closeAllSheets();
      view.toast(view.translate("inviteDeclined"));
      return;
    }
    view.closeAllSheets();
  });
  view.on("open-send-sheet", () => view.openSendSheet());
  view.on("open-receive-sheet", () => view.openReceiveSheet());
  view.on("open-chat-sheet", () => view.openChatSheet());
  view.on("open-received", async ({ transferId, fileId }) => {
    if (!runtime.realTransfer || !transferId || !fileId) return;
    try {
      const exported = await transfer.storage.exportFile(fileId, { sessionId: transferId });
      if (!exported?.blob) return;
      const url = URL.createObjectURL(exported.blob);
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      view.toast(view.translate("noReceived"));
    }
  });
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
    const { connectedPeerId, mode } = store.getState();
    if (mode === "verifying" || mode === "disconnecting") {
      view.toast(view.translate(mode === "verifying" ? "verifying" : "disconnecting"));
      return;
    }
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
    if (!peer) {
      view.toast(view.translate("connectionRejected"));
      return;
    }
    activePeerId = peerId;
    store.patch({ selectedPeerId: peerId });
    view.openPeerSheet(peer, { peers: store.getState().peers });
  });

  view.on("swipe-connect", async () => {
    if (!activePeerId) return;
    const initialState = store.getState();
    if (initialState.mode === "verifying") return;
    const currentPeerId = initialState.connectedPeerId;
    if (currentPeerId && currentPeerId !== activePeerId) {
      view.closePeerSheet();
      view.toast(view.translate("oneConnection"));
      return;
    }
    if (currentPeerId === activePeerId) return;
    const peerId = activePeerId;
    const peer = findPeer(peerId);
    if (!peer) {
      activePeerId = null;
      store.patch({ selectedPeerId: null, pendingInviteId: null, incomingInvite: null });
      return;
    }
    const acceptingIncoming = incomingInvite?.peerId === peerId;
    let productionInitiator = !acceptingIncoming;
    const useQrPairing = shouldUseQrPairing(peer);
    const permissionPromises = runtime.realProximityCeremony && !useQrPairing
      ? {
        microphone: proximity.requestMicrophonePermission(),
        motion: proximity.requestMotionPermission()
      }
      : null;
    if (acceptingIncoming && !runtime.productionSignaling) {
      const invite = incomingInvite;
      incomingInvite = null;
      await signaling.acceptInvite?.(peerId, invite.pairingId);
    }
    store.patch({ mode: "verifying", pendingInviteId: peerId, incomingInvite: null });
    await view.closePeerSheet();
    if (!isCurrentVerification(peerId)) return;
    if (useQrPairing) {
      view.showIslandQrScanner({ self: initialState.self, peer, autoStartCamera: false });
    } else {
      view.showIslandConnectionProgress({ self: initialState.self, peer });
    }
    if (runtime.productionSignaling) {
      const pairing = await establishProductionPairing(peerId);
      if (!pairing || !isCurrentVerification(peerId)) {
        stopProximitySensors();
        store.patch({ mode: "lobby", pendingInviteId: null, incomingInvite: null, pairingId: null });
        return;
      }
      store.patch({ pairingId: pairing.pairingId });
      productionInitiator = pairing.initiator !== false;
    }
    let result;
    try {
      result = useQrPairing
        ? await runQrPairing(peerId, productionInitiator)
        : runtime.realProximityCeremony
          ? await runRealProximityCeremony(peerId, permissionPromises)
          : await proximity.runCeremony({ peer, capabilities: store.getState().capabilities });
      if (result?.reason === "qr-fallback-requested" && runtime.realProximityCeremony) {
        result = await runRealProximityCeremony(peerId, null);
      }
    } catch {
      await resetFailedVerification(peerId);
      return;
    }
    if (!isCurrentVerification(peerId)) return;
    const pairingId = store.getState().pairingId;
    const verifiedByQr = useQrPairing && result.reason === "qr-verified";
    const proximityDecision = verifiedByQr
      ? Promise.resolve({ pairVerified: result.passed })
      : runtime.realProximityCeremony
      ? waitForProximityDecision(pairingId, 30000)
      : Promise.resolve({ pairVerified: true });
    if (!verifiedByQr) {
      await signaling.sendProximityTelemetry(peerId, result.metrics, {
        pairingId
      });
    }
    const decision = await proximityDecision;
    if (!isCurrentVerification(peerId)) return;
    if (!result?.passed || !decision?.pairVerified) {
      view.closeDynamicIsland();
      if (runtime.productionSignaling && pairingId) {
        await signaling.disconnectPeer?.(peerId, pairingId);
      }
      store.patch({ mode: "lobby", pendingInviteId: null, incomingInvite: null, pairingId: null });
      view.toast(view.translate("qrFallback"));
      return;
    }
    let path;
    try {
      path = runtime.realTransfer
        ? await connectProductionTransport(peerId, { initiator: productionInitiator })
        : await transport.preflight(peerId);
    } catch {
      await resetFailedVerification(peerId);
      return;
    }
    if (!isCurrentVerification(peerId)) return;
    const islandRetracted = await view.finishIslandConnectionTransition();
    if (!islandRetracted || !isCurrentVerification(peerId)) return;
    store.patch({
      mode: "connected",
      connectedPeerId: peerId,
      pendingInviteId: null,
      incomingInvite: null,
      path,
      receivedCount: 1,
      receivedItems: demoPdfItems(),
      peers: store.getState().peers.map((candidate) =>
        candidate.id === peerId ? { ...candidate, stage: "near" } : candidate
      )
    });
    view.pulseConnectionHaptic();
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
    const state = store.getState();
    const { files, connectedPeerId, pairingId, transfer: activeTransfer } = state;
    if (!connectedPeerId || state.mode !== "connected") {
      view.toast(view.translate("connectFirst"));
      return;
    }
    if (activeTransfer) return;
    if (!files.length) {
      view.openFilePicker();
      return;
    }
    try {
      store.patch({
        transfer: {
          direction: "send",
          stage: "preparing",
          ratio: 0,
          transferredBytes: 0,
          totalBytes: files.reduce((sum, file) => sum + file.size, 0)
        }
      });
      await transfer.send(files, {
        peerId: connectedPeerId,
        pairingId,
        onProgress(progress) {
          if (!isActiveConnection(connectedPeerId, pairingId)) return;
          store.patch({ transfer: progress });
        }
      });
    } catch {
      if (!isActiveConnection(connectedPeerId, pairingId)) return;
      store.patch({ transfer: null });
      view.toast(view.translate("transferFailed"));
      return;
    }
    if (!isActiveConnection(connectedPeerId, pairingId)) return;
    if (runtime.realTransfer) {
      store.patch({ transfer: null, files: [] });
      view.closeActionSheets();
      view.toast(view.translate("transferComplete"));
      return;
    }
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

  view.on("send-chat", async () => {
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
    if (runtime.productionSignaling && peerId) {
      try {
        const sent = await signaling.sendChatMessage?.(peerId, {
          id: crypto.randomUUID?.() || `msg-${Date.now()}`,
          text: message,
          createdAt: new Date().toISOString()
        }, {
          pairingId: store.getState().pairingId
        });
        if (sent === false) throw new Error("Chat message was not accepted by signaling.");
      } catch (error) {
        console.warn("Chat message delivery failed.", error);
        view.toast(view.translate("messageFailed"));
      }
      return;
    }
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
    view.pulseDisconnectHaptic();
    store.patch({ mode: "disconnecting", transfer: null });
    view.closeAllSheets();
    view.closeDynamicIsland();
    view.toast(view.translate("disconnecting"));
    await wait(920);
    try {
      transport.close?.();
      await signaling.disconnectPeer?.(current.connectedPeerId, current.pairingId);
    } finally {
      clearVerificationWaiters();
      resolveQrCancellation();
      store.patch({
        mode: "lobby",
        connectedPeerId: null,
        selectedPeerId: null,
        pendingInviteId: null,
        incomingInvite: null,
        pairingId: null,
        files: [],
        transfer: null,
        path: "unknown",
        receivedCount: 0,
        receivedItems: [],
        chatMessages: []
      });
      activePeerId = null;
      incomingInvite = null;
    }
    view.toast(view.translate("disconnected"));
  });

  view.on("qr-fallback", () => {
    view.toast(view.translate("qrInfo"));
  });

  view.on("island-qr-detected", (token) => {
    qrScanResolver?.(token);
    qrScanResolver = null;
  });

  view.on("island-cancel", async () => {
    const current = store.getState();
    resolveQrCancellation();
    view.closeDynamicIsland();
    if (current.pendingInviteId && current.pairingId) {
      await signaling.disconnectPeer?.(current.pendingInviteId, current.pairingId);
    }
    store.patch({
      mode: "lobby",
      selectedPeerId: null,
      pendingInviteId: null,
      incomingInvite: null,
      pairingId: null
    });
    activePeerId = null;
    view.toast(view.translate("qrCancelled"));
  });

  view.on("island-fallback", async () => {
    const current = store.getState();
    if (current.pendingInviteId && current.pairingId) {
      await signaling.sendProximityFallback?.(current.pendingInviteId, current.pairingId);
    }
    qrFallbackResolver?.();
    qrFallbackResolver = null;
    view.closeDynamicIsland();
  });

  async function runRealProximityCeremony(peerId, permissionPromises) {
    const microphonePromise = permissionPromises?.microphone || proximity.requestMicrophonePermission();
    const motionPromise = permissionPromises?.motion || proximity.requestMotionPermission();
    const [microphonePermission, motionPermission] = await Promise.all([
      microphonePromise,
      motionPromise
    ]);
    proximity.resetMotionCapture();
    if (motionPermission.granted) proximity.startMotionCapture();
    try {
      const pairingId = store.getState().pairingId;
      const startPromise = waitForProximityStart(pairingId, 30000);
      await signaling.sendProximityReady?.(peerId, pairingId);
      const start = await startPromise;
      if (!start) {
        return {
          passed: false,
          score: 0,
          metrics: { peerId, ceremonyStart: "timeout" },
          evidence: {},
          reason: "ceremony-start-timeout"
        };
      }
      const result = await proximity.runRealCeremony({
        acoustic: microphonePermission.granted,
        acousticRole: store.getState().self.id < peerId ? "emit" : "detect",
        startAt: start.startAt,
        ceremonyDurationMs: start.durationMs,
        tokenFresh: Boolean(pairingId)
      });
      return {
        ...result,
        metrics: {
          ...result.metrics,
          microphonePermission: microphonePermission.reason || (microphonePermission.granted ? "granted" : "denied"),
          motionPermission: motionPermission.reason || (motionPermission.granted ? "granted" : "denied"),
          peerId
        }
      };
    } finally {
      stopProximitySensors();
    }
  }

  function stopProximitySensors() {
    proximity.stopMotionCapture();
    proximity.stopAcousticCapture();
  }

  async function establishProductionPairing(peerId) {
    if (incomingInvite?.peerId === peerId) {
      const pairingId = incomingInvite.pairingId;
      incomingInvite = null;
      const accepted = waitForPairing(peerId, 30000);
      await signaling.acceptInvite(peerId, pairingId);
      const confirmation = await accepted;
      return confirmation ? { ...confirmation, initiator: false } : null;
    }
    const accepted = waitForPairing(peerId, 30000);
    await signaling.sendInvite(peerId);
    const pairing = await accepted;
    return pairing ? { ...pairing, initiator: true } : null;
  }

  async function runQrPairing(peerId, productionInitiator) {
    try {
      const state = store.getState();
      const pairingId = state.pairingId;
      const peer = findPeer(peerId);
      if (!pairingId || !peer) return failedQrResult("missing-pairing");
      const cancelled = waitForQrCancel();
      const fallback = waitForQrFallback();

      if (productionInitiator) {
        const verified = waitForQrVerified(pairingId, 120000);
        const issued = waitForQrIssued(pairingId, 15000);
        await signaling.issueQrToken?.(peerId, pairingId);
        const payload = await Promise.race([issued, cancelled, fallback]);
        if (payload?.fallback) return failedQrResult("qr-fallback-requested");
        if (!payload?.token) return failedQrResult("issue-failed");
        view.showIslandQrDisplay({ self: state.self, peer, token: payload.token });
        const result = await Promise.race([verified, cancelled, fallback]);
        if (result?.fallback) return failedQrResult("qr-fallback-requested");
        if (!result?.valid) return failedQrResult("verification-failed");
      } else {
        view.showIslandQrScanner({ self: state.self, peer });
        while (isCurrentVerification(peerId)) {
          const token = await Promise.race([waitForQrScan(120000), cancelled, fallback]);
          if (token?.fallback) return failedQrResult("qr-fallback-requested");
          if (!token) return failedQrResult("scan-cancelled");
          const verified = waitForQrVerified(pairingId, 15000);
          await signaling.verifyQrToken?.(peerId, pairingId, token);
          const result = await Promise.race([verified, cancelled, fallback]);
          if (result?.fallback) return failedQrResult("qr-fallback-requested");
          if (result?.valid) break;
          view.retryIslandQrScanner();
        }
      }

      return {
        passed: true,
        score: 1,
        metrics: { peerId, method: "qr", pairingId },
        evidence: { qrVerified: true },
        reason: "qr-verified"
      };
    } finally {
      clearQrTransientWaiters();
    }
  }

  function shouldUseQrPairing(peer) {
    if (!runtime.qrPairing) return false;
    const selfPlatform = store.getState().capabilities?.platform;
    const selfCapabilities = store.getState().capabilities;
    const peerPlatform = peer?.capabilities?.platform;
    const peerCapabilities = peer?.capabilities;
    return Boolean(
      selfPlatform?.isIPhone
      && peerPlatform?.isIPhone
      && selfCapabilities?.camera
      && selfCapabilities?.qrScanner
      && peerCapabilities?.camera
      && peerCapabilities?.qrScanner
    );
  }

  function waitForQrIssued(pairingId, timeoutMs) {
    return waitForMapValue(qrIssuedWaiters, pairingId, timeoutMs);
  }

  function waitForQrVerified(pairingId, timeoutMs) {
    return waitForMapValue(qrVerifiedWaiters, pairingId, timeoutMs);
  }

  function waitForMapValue(map, key, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        map.delete(key);
        resolve(null);
      }, timeoutMs);
      map.set(key, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function waitForQrScan(timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        qrScanResolver = null;
        resolve(null);
      }, timeoutMs);
      qrScanResolver = (token) => {
        clearTimeout(timer);
        resolve(token);
      };
    });
  }

  function waitForQrCancel() {
    return new Promise((resolve) => {
      qrCancelResolver = () => resolve(null);
    });
  }

  function waitForQrFallback() {
    return new Promise((resolve) => {
      qrFallbackResolver = () => resolve({ fallback: true });
    });
  }

  function resolveQrCancellation() {
    qrScanResolver?.(null);
    qrScanResolver = null;
    qrCancelResolver?.();
    qrCancelResolver = null;
    qrFallbackResolver = null;
  }

  function clearQrTransientWaiters() {
    qrScanResolver = null;
    qrCancelResolver = null;
    qrFallbackResolver = null;
  }

  function clearVerificationWaiters() {
    pairingWaiters.forEach((resolve) => resolve(null));
    pairingWaiters.clear();
    proximityDecisionWaiters.forEach((resolve) => resolve(null));
    proximityDecisionWaiters.clear();
    proximityStartWaiters.forEach((resolve) => resolve(null));
    proximityStartWaiters.clear();
    qrIssuedWaiters.forEach((resolve) => resolve(null));
    qrIssuedWaiters.clear();
    qrVerifiedWaiters.forEach((resolve) => resolve(null));
    qrVerifiedWaiters.clear();
  }

  function failedQrResult(reason) {
    return {
      passed: false,
      score: 0,
      metrics: { method: "qr", reason },
      evidence: {},
      reason
    };
  }

  function waitForPairing(peerId, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pairingWaiters.delete(peerId);
        resolve(null);
      }, timeoutMs);
      pairingWaiters.set(peerId, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function waitForProximityDecision(pairingId, timeoutMs) {
    if (!pairingId) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proximityDecisionWaiters.delete(pairingId);
        resolve(null);
      }, timeoutMs);
      proximityDecisionWaiters.set(pairingId, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function waitForProximityStart(pairingId, timeoutMs) {
    if (!pairingId) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proximityStartWaiters.delete(pairingId);
        resolve(null);
      }, timeoutMs);
      proximityStartWaiters.set(pairingId, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  async function connectProductionTransport(peerId, { initiator }) {
    const pairingId = store.getState().pairingId;
    transport.enable({ peerId, pairingId });
    await transport.connect(peerId, { pairingId, initiator });
    await waitForTransportConnection(transport, 30000);
    const stats = await transport.getPathStats();
    await signaling.sendPathMetric?.(peerId, {
      path: stats.path,
      rttMs: stats.currentRoundTripTime == null ? null : stats.currentRoundTripTime * 1000
    }, { pairingId });
    return stats.path;
  }

  function findPeer(peerId) {
    return store.getState().peers.find((peer) => peer.id === peerId);
  }

  function isCurrentVerification(peerId) {
    const state = store.getState();
    return state.mode === "verifying" && state.pendingInviteId === peerId;
  }

  function isActiveConnection(peerId, pairingId) {
    const state = store.getState();
    return state.mode === "connected"
      && state.connectedPeerId === peerId
      && state.pairingId === pairingId;
  }

  async function resetFailedVerification(peerId) {
    const { pairingId } = store.getState();
    stopProximitySensors();
    resolveQrCancellation();
    clearVerificationWaiters();
    view.closeDynamicIsland();
    if (runtime.productionSignaling && pairingId) {
      await signaling.disconnectPeer?.(peerId, pairingId).catch(() => {});
    }
    if (!isCurrentVerification(peerId)) return;
    store.patch({
      mode: "lobby",
      selectedPeerId: null,
      pendingInviteId: null,
      incomingInvite: null,
      pairingId: null,
      transfer: null,
      path: "unknown"
    });
    activePeerId = null;
    incomingInvite = null;
    view.toast(view.translate("connectionRejected"));
  }

  function handleInviteRejected(payload = {}) {
    const peerId = payload.fromId || payload.peerId || payload.targetId;
    if (peerId && activePeerId && peerId !== activePeerId) return;
    if (peerId) {
      pairingWaiters.get(peerId)?.(null);
      pairingWaiters.delete(peerId);
    }
    clearIncomingInvite();
    view.closePeerSheet();
    view.toast(view.translate("inviteDeclined"));
  }

  function clearIncomingInvite() {
    incomingInvite = null;
    store.patch({
      mode: store.getState().mode === "verifying" ? "verifying" : "lobby",
      selectedPeerId: null,
      pendingInviteId: null,
      incomingInvite: null,
      pairingId: null
    });
    activePeerId = null;
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

function waitForTransportConnection(transport, timeoutMs) {
  if (transport.peerConnection?.connectionState === "connected") return Promise.resolve();
  if (["failed", "closed"].includes(transport.peerConnection?.connectionState)) {
    return Promise.reject(new Error(`WebRTC connection ${transport.peerConnection.connectionState}.`));
  }
  return new Promise((resolve, reject) => {
    let cleanup = () => {};
    const fail = (state) => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`WebRTC connection ${state}.`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the remote WebRTC offer."));
    }, timeoutMs);
    cleanup = transport.on?.("connection-state", ({ state }) => {
      if (state === "failed" || state === "closed") {
        fail(state);
        return;
      }
      if (state !== "connected") return;
      clearTimeout(timer);
      cleanup();
      resolve();
    }) || cleanup;
  });
}

import { formatBytes } from "../utils/format.js?v=1.0.86";
import { isPreviewableReceivedItem } from "../utils/received-files.js?v=1.0.86";
import { BUMP_SCORE_POINTS } from "../services/proximity-engine.js?v=1.0.86";

const TRANSFER_SESSION_CAP_BYTES = 500 * 1024 * 1024;
const PROXIMITY_SCORE_MINIMUM = 55;
const PROXIMITY_PERMISSION_KEY = "webdrop.proximityPermissions";

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
  let activeConnectionMethod = "proximity";
  let activeQrRole = null;
  let incomingInvite = null;
  const pairingWaiters = new Map();
  const proximityDecisionWaiters = new Map();
  const proximityStartWaiters = new Map();
  const qrIssuedWaiters = new Map();
  const qrVerifiedWaiters = new Map();
  let peerlessQrIssuedResolver = null;
  let peerlessQrVerifiedResolver = null;
  let qrScanResolver = null;
  let qrCancelResolver = null;
  let qrFallbackResolver = null;
  let failedProximityPeerId = null;
  let proximitySessionId = null;
  let proximitySessionJoinedResolver = null;
  let proximitySessionStartResolver = null;
  let proximityMatchResolver = null;
  let proximitySessionFailedResolver = null;
  let pendingTransferPatch = null;
  let transferPatchFrame = 0;
  let receivePresentationTimer = 0;
  let permissionRequestPromise = null;
  let suppressDisconnectToast = false;
  let adminMonitor = null;
  let pendingAdminMonitor = null;
  let adminMonitorRetryTimer = 0;
  const storedPermissions = readStoredPermissions();
  proximity.restoreMotionPermission?.(storedPermissions.motion);
  globalThis.addEventListener?.("pagehide", () => proximity.close?.(), { once: true });

  const scheduleTransferPatch = (transferPatch) => {
    pendingTransferPatch = transferPatch;
    if (transferPatchFrame) return;
    const schedule = globalThis.requestAnimationFrame || ((callback) => globalThis.setTimeout(callback, 16));
    transferPatchFrame = schedule(() => {
      transferPatchFrame = 0;
      const nextTransfer = pendingTransferPatch;
      pendingTransferPatch = null;
      if (nextTransfer) store.patch({ transfer: nextTransfer });
    });
  };

  const cancelPendingTransferPatch = () => {
    pendingTransferPatch = null;
    if (!transferPatchFrame) return;
    const cancel = globalThis.cancelAnimationFrame || globalThis.clearTimeout;
    cancel(transferPatchFrame);
    transferPatchFrame = 0;
  };

  signaling.on("connected", () => {
    store.patch({ signalingStatus: "online" });
  });

  signaling.on("connection-failed", () => {
    if (!runtime.productionSignaling) return;
    const wasOffline = store.getState().signalingStatus === "offline";
    store.patch({ signalingStatus: "offline", peers: [] });
    if (!wasOffline) view.toast(view.translate("signalingUnavailable"));
  });

  signaling.on("disconnected", () => {
    if (!runtime.productionSignaling) return;
    stopAdminAcousticMonitor();
    pendingAdminMonitor = null;
    const wasOnline = store.getState().signalingStatus === "online";
    transport.close?.();
    cancelPendingTransferPatch();
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
      chatMessages: [],
      unreadChatCount: 0,
      signalingStatus: "offline"
    });
    activePeerId = null;
    incomingInvite = null;
    proximitySessionId = null;
    clearProximitySessionWaiters();
    view.closeDynamicIsland();
    if (wasOnline) view.toast(view.translate("signalingLost"));
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
    if (payload.type?.startsWith("proximity:qr:")) {
      peerlessQrIssuedResolver?.(null);
      peerlessQrIssuedResolver = null;
      peerlessQrVerifiedResolver?.(null);
      peerlessQrVerifiedResolver = null;
    }
    view.toast(view.translate("connectionRejected"));
  });

  signaling.on("protocol:error", (payload = {}) => {
    if (payload.code === "client_id_in_use") {
      view.toast(view.translate("signalingLost"));
      return;
    }
    view.toast(view.translate("connectionRejected"));
  });

  signaling.on("peers", (peers) => {
    store.patch({ peers: sanitizePeers(peers) });
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
    if (!wasVerifying) view.toast(view.translate("acceptedToast", { name: peer.name }));
  });

  signaling.on("invite", (payload) => {
    const peerId = payload?.fromId;
    const peer = store.getState().peers.find((candidate) => candidate.id === peerId) || payload?.from;
    if (!peerId || !peer) return;
    const state = store.getState();
    const connectionMethod = payload?.payload?.method === "qr" ? "qr" : "proximity";
    const requestedQrRole = normalizeQrRole(payload?.payload?.qrRole);
    if (state.mode === "verifying" && state.pendingInviteId === peerId && connectionMethod === "proximity") {
      incomingInvite = {
        peerId,
        pairingId: payload.pairingId || null,
        receivedAt: payload.receivedAt || new Date().toISOString(),
        from: peer,
        method: connectionMethod
      };
      activeConnectionMethod = connectionMethod;
      signaling.acceptInvite?.(peerId, payload.pairingId);
      return;
    }
    if (state.mode === "verifying" && state.pendingInviteId === peerId && connectionMethod === "qr") {
      incomingInvite = {
        peerId,
        pairingId: payload.pairingId || null,
        receivedAt: payload.receivedAt || new Date().toISOString(),
        from: peer,
        method: connectionMethod,
        qrRole: requestedQrRole
      };
      activeConnectionMethod = "qr";
      activeQrRole = state.self.id < peerId ? "show" : "scan";
      signaling.acceptInvite?.(peerId, payload.pairingId);
      return;
    }
    if (state.connectedPeerId || state.mode === "verifying" || state.mode === "disconnecting") {
      signaling.rejectInvite?.(peerId, payload.pairingId);
      view.toast(view.translate("inviteDeclinedBusy", { name: peer.name }));
      return;
    }
    incomingInvite = {
      peerId,
      pairingId: payload.pairingId || null,
      receivedAt: payload.receivedAt || new Date().toISOString(),
      from: peer,
      method: connectionMethod,
      qrRole: requestedQrRole
    };
    activePeerId = peerId;
    activeConnectionMethod = connectionMethod;
    store.patch({
      mode: "lobby",
      selectedPeerId: peerId,
      pendingInviteId: peerId,
      incomingInvite,
      pairingId: payload.pairingId || null
    });
    if (connectionMethod === "qr") {
      view.toast(view.translate("incomingQrInviteToast", { name: peer.name }));
    } else {
      view.toast(view.translate("incomingInviteToast", { name: peer.name }));
    }
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
      ],
      unreadChatCount: view.isChatSheetOpen?.() ? state.unreadChatCount : (state.unreadChatCount || 0) + 1
    }));
  });

  signaling.on("proximity:decision", (payload) => {
    if (!payload?.pairingId) return;
    proximityDecisionWaiters.get(payload.pairingId)?.(payload);
  });

  signaling.on("proximity:start", (payload) => {
    if (!payload?.pairingId || !payload?.startAt) return;
    proximityStartWaiters.get(payload.pairingId)?.(payload);
    proximityStartWaiters.delete(payload.pairingId);
  });

  signaling.on("proximity:qr:issued", (payload) => {
    if (!payload?.pairingId || !payload?.token) return;
    peerlessQrIssuedResolver?.(payload);
    qrIssuedWaiters.get(payload.pairingId)?.(payload);
    qrIssuedWaiters.delete(payload.pairingId);
  });

  signaling.on("proximity:qr:verified", (payload) => {
    if (!payload?.pairingId) return;
    peerlessQrVerifiedResolver?.(payload);
    qrVerifiedWaiters.get(payload.pairingId)?.(payload);
    qrVerifiedWaiters.delete(payload.pairingId);
    if (payload.valid) view.markIslandQrSuccess();
  });

  signaling.on("proximity:fallback", () => {
    qrFallbackResolver?.();
    qrFallbackResolver = null;
    view.closeDynamicIsland();
  });

  signaling.on("proximity:session:joined", (payload = {}) => {
    proximitySessionId = payload.sessionId || proximitySessionId;
    proximitySessionJoinedResolver?.(payload);
    proximitySessionJoinedResolver = null;
  });

  signaling.on("proximity:session:start", (payload = {}) => {
    proximitySessionId = payload.sessionId || proximitySessionId;
    proximitySessionStartResolver?.(payload);
    proximitySessionStartResolver = null;
  });

  signaling.on("proximity:match", (payload = {}) => {
    proximityMatchResolver?.(payload);
    proximityMatchResolver = null;
  });

  signaling.on("proximity:session:failed", (payload = {}) => {
    proximitySessionFailedResolver?.(payload);
    proximitySessionFailedResolver = null;
    proximitySessionStartResolver?.(null);
    proximitySessionStartResolver = null;
    proximityMatchResolver?.(null);
    proximityMatchResolver = null;
  });

  signaling.on("admin:monitor:start", (payload = {}) => {
    armAdminAcousticMonitor(payload);
  });

  signaling.on("admin:monitor:stop", (payload = {}) => {
    stopAdminAcousticMonitor(payload.monitorId);
  });

  signaling.on("admin:monitor:stopped", (payload = {}) => {
    stopAdminAcousticMonitor(payload.monitorId);
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
      chatMessages: [],
      unreadChatCount: 0
    });
    activePeerId = null;
    resolveQrCancellation();
    clearVerificationWaiters();
    if (!suppressDisconnectToast) view.closeDynamicIsland();
    if (!suppressDisconnectToast) {
      view.toast(view.translate("disconnected"));
    }
    if (suppressDisconnectToast && failedProximityPeerId) activePeerId = failedProximityPeerId;
    suppressDisconnectToast = false;
  });

  function armAdminAcousticMonitor(payload) {
    stopAdminAcousticMonitor();
    pendingAdminMonitor = payload;
    tryStartAdminAcousticMonitor();
  }

  function tryStartAdminAcousticMonitor() {
    const payload = pendingAdminMonitor;
    if (!payload) return false;
    const monitorId = payload.monitorId;
    const adminId = payload.adminId;
    if (!monitorId || !adminId) {
      pendingAdminMonitor = null;
      return false;
    }
    const state = store.getState();
    const status = proximity.getAcousticStatus?.() || {};
    if (state.mode === "verifying") {
      signaling.sendAdminMonitorTelemetry?.(adminId, {
        monitorId,
        status: "waiting",
        reason: "proximity-ceremony-active",
        sampledAt: Date.now()
      });
      view.toast(view.translate("diagnosticWaitingForCeremony"));
      globalThis.clearTimeout(adminMonitorRetryTimer);
      adminMonitorRetryTimer = globalThis.setTimeout(() => tryStartAdminAcousticMonitor(), 500);
      return false;
    }
    const motionCapture = proximity.startMotionCapture?.() || {};
    if (!status.streamActive || status.contextState !== "running" || !motionCapture.started) {
      proximity.stopMotionCapture?.();
      signaling.sendAdminMonitorTelemetry?.(adminId, {
        monitorId,
        status: "waiting",
        reason: "device-tap-required",
        contextState: status.contextState,
        sampleRate: status.sampleRate,
        sampledAt: Date.now()
      });
      view.toast(view.translate("diagnosticTapConnect"));
      globalThis.clearTimeout(adminMonitorRetryTimer);
      adminMonitorRetryTimer = globalThis.setTimeout(() => tryStartAdminAcousticMonitor(), 700);
      return false;
    }
    proximity.resetMotionCapture?.();
    proximity.startMotionCapture?.();
    adminMonitor = {
      monitorId,
      adminId,
      sequence: 0,
      intervalMs: Math.max(500, Math.min(5000, Number(payload.intervalMs) || 1000)),
      startFrequencyHz: Number(payload.startFrequencyHz) || 18_600,
      endFrequencyHz: Number(payload.endFrequencyHz) || 19_400,
      emit: payload.emit !== false,
      timer: 0,
      stopped: false
    };
    pendingAdminMonitor = null;
    globalThis.clearTimeout(adminMonitorRetryTimer);
    adminMonitorRetryTimer = 0;
    view.toast(view.translate("diagnosticStarted"));
    runAdminAcousticMonitorTick(adminMonitor);
    return true;
  }

  async function runAdminAcousticMonitorTick(monitor) {
    if (!adminMonitor || adminMonitor !== monitor || monitor.stopped) return;
    monitor.sequence += 1;
    let emitted = { emitted: false };
    try {
      const monitorBands = [
        {
          startFrequencyHz: monitor.startFrequencyHz,
          endFrequencyHz: monitor.endFrequencyHz,
          role: "target"
        },
        ...adminMonitorFrequencyBands()
      ];
      const emission = monitor.emit
        ? proximity.emitAcousticChirp?.({
          startFrequencyHz: monitor.startFrequencyHz,
          endFrequencyHz: monitor.endFrequencyHz
        })
        : Promise.resolve(emitted);
      const snapshots = [];
      for (const delayMs of [18, 30, 30]) {
        await wait(delayMs);
        const snapshot = await proximity.sampleAcousticFrequencyBands?.({
          bands: monitorBands
        });
        if (snapshot?.available) snapshots.push(snapshot);
      }
      emitted = await emission || emitted;
      if (!adminMonitor || adminMonitor !== monitor || monitor.stopped) return;
      const sampled = strongestAdminMonitorSnapshot(snapshots, monitorBands.length);
      const sample = sampled.bands[0] || {};
      const motion = proximity.getSnapshot?.().motion || {};
      const tiltDegrees = maximumTiltDegrees(motion.tilt);
      signaling.sendAdminMonitorTelemetry?.(monitor.adminId, {
        monitorId: monitor.monitorId,
        status: sampled.available ? "active" : "blocked",
        reason: sampled.reason || emitted.reason || null,
        sequence: monitor.sequence,
        sampledAt: Date.now(),
        contextState: sampled.contextState || proximity.getAcousticStatus?.().contextState,
        sampleRate: sampled.sampleRate || emitted.sampleRate,
        emitted: Boolean(emitted.emitted),
        detected: Boolean(sample.detected),
        startFrequencyHz: monitor.startFrequencyHz,
        endFrequencyHz: monitor.endFrequencyHz,
        peakDb: sample.peakDb,
        noiseDb: sample.noiseDb,
        marginDb: sample.marginDb,
        confidence: sample.confidence,
        bands: sampled.bands.slice(1),
        bumpDetected: Boolean(motion.bump),
        bumpPoints: motion.bump ? BUMP_SCORE_POINTS : 0,
        tiltDetected: Boolean(motion.tilted),
        tiltDegrees,
        motionSamples: Number(motion.samples || 0),
        maxAcceleration: Number(motion.maxAcceleration || 0)
      });
    } catch (error) {
      if (!adminMonitor || adminMonitor !== monitor || monitor.stopped) return;
      signaling.sendAdminMonitorTelemetry?.(monitor.adminId, {
        monitorId: monitor.monitorId,
        status: "error",
        reason: error?.message || "monitor-failed",
        sequence: monitor.sequence,
        sampledAt: Date.now()
      });
    }
    if (!adminMonitor || adminMonitor !== monitor || monitor.stopped) return;
    monitor.timer = globalThis.setTimeout(
      () => runAdminAcousticMonitorTick(monitor),
      monitor.intervalMs
    );
  }

  function adminMonitorFrequencyBands() {
    return [
      { startFrequencyHz: 18_000, endFrequencyHz: 18_500 },
      { startFrequencyHz: 18_500, endFrequencyHz: 19_500 },
      { startFrequencyHz: 19_500, endFrequencyHz: 20_500 },
      { startFrequencyHz: 20_500, endFrequencyHz: 21_000 }
    ];
  }

  function strongestAdminMonitorSnapshot(snapshots, bandCount) {
    if (!snapshots.length) {
      return {
        available: false,
        reason: "frequency-sample-unavailable",
        bands: Array.from({ length: bandCount }, () => ({}))
      };
    }
    const strongestBands = Array.from({ length: bandCount }, (_, index) => (
      snapshots
        .map((snapshot) => snapshot.bands?.[index])
        .filter(Boolean)
        .sort((left, right) => (
          Number(right.confidence ?? 0) - Number(left.confidence ?? 0)
          || Number(right.marginDb ?? -Infinity) - Number(left.marginDb ?? -Infinity)
          || Number(right.peakDb ?? -Infinity) - Number(left.peakDb ?? -Infinity)
        ))[0] || {}
    ));
    const latest = snapshots.at(-1) || {};
    return {
      available: true,
      contextState: latest.contextState,
      sampleRate: latest.sampleRate,
      bands: strongestBands
    };
  }

  function stopAdminAcousticMonitor(monitorId) {
    globalThis.clearTimeout(adminMonitorRetryTimer);
    adminMonitorRetryTimer = 0;
    if (pendingAdminMonitor && (!monitorId || pendingAdminMonitor.monitorId === monitorId)) {
      pendingAdminMonitor = null;
    }
    if (!adminMonitor || (monitorId && adminMonitor.monitorId !== monitorId)) return;
    adminMonitor.stopped = true;
    globalThis.clearTimeout(adminMonitor.timer);
    adminMonitor = null;
    proximity.stopMotionCapture?.();
  }

  function maximumTiltDegrees(tilt = {}) {
    return Math.max(Math.abs(Number(tilt.beta || 0)), Math.abs(Number(tilt.gamma || 0)));
  }

  transfer.on?.("receive-ready", ({ transferId, manifest }) => {
    globalThis.clearTimeout(receivePresentationTimer);
    receivePresentationTimer = 0;
    store.patch({
      transfer: {
        transferId,
        direction: "receive",
        stage: "preparing",
        name: manifest?.files?.[0]?.name || "",
        ratio: 0,
        transferredBytes: 0,
        totalBytes: manifest?.totalBytes || 0
      }
    });
  });

  transfer.on?.("received", (result) => {
    cancelPendingTransferPatch();
    const receivedItems = (result.files || []).map((file) => ({
      id: file.fileId,
      transferId: result.sessionId,
      name: file.name,
      size: formatBytes(file.receivedBytes),
      icon: file.type?.includes("pdf") ? "P" : file.type?.startsWith("image/") ? "◎" : "⌁",
      type: file.type || "application/octet-stream",
      storageBackend: file.backend,
      sha256: file.sha256,
      ready: true,
      url: file.blob ? URL.createObjectURL(file.blob) : "",
      downloadName: file.name,
      status: file.openUnavailable ? "saved" : "ready",
      canSave: Boolean(file.blob || file.canSave)
    }));
    store.update((state) => {
      const activeReceive = state.transfer?.direction === "receive"
        && [state.transfer?.transferId, state.transfer?.sessionId].includes(result.sessionId);
      return {
        ...state,
        receivedCount: state.receivedCount + receivedItems.length,
        receivedItems: [...state.receivedItems, ...receivedItems],
        transfer: activeReceive ? {
          ...state.transfer,
          stage: "complete",
          ratio: 1,
          transferredBytes: state.transfer.totalBytes || result.receivedBytes || 0
        } : state.transfer
      };
    });
    globalThis.clearTimeout(receivePresentationTimer);
    receivePresentationTimer = globalThis.setTimeout(() => {
      receivePresentationTimer = 0;
      const current = store.getState().transfer;
      if (current?.direction === "receive" && [current.transferId, current.sessionId].includes(result.sessionId)) {
        store.patch({ transfer: null });
      }
    }, 1400);
  });

  transfer.on?.("receive-progress", (progress) => {
    const current = store.getState().transfer;
    scheduleTransferPatch({
      ...current,
      ...progress,
      transferId: progress.transferId || current?.transferId,
      name: current?.name || progress.name || "",
      direction: "receive"
    });
  });

  transfer.on?.("failed", () => {
    globalThis.clearTimeout(receivePresentationTimer);
    receivePresentationTimer = 0;
    cancelPendingTransferPatch();
    store.patch({ transfer: null });
  });

  transfer.on?.("canceled", () => {
    globalThis.clearTimeout(receivePresentationTimer);
    receivePresentationTimer = 0;
    cancelPendingTransferPatch();
    store.patch({ transfer: null });
  });

  view.on("settings", () => view.openSettings());
  view.on("close-settings", () => view.closeSettings());
  view.on("open-information", () => view.openInformation());
  view.on("back-to-settings", () => view.backToSettings());
  view.on("close-information", () => view.closeInformation());
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
  view.on("open-chat-sheet", () => {
    store.patch({ unreadChatCount: 0 });
    view.openChatSheet();
  });
  view.on("open-received", async ({ transferId, fileId, intent = "download" }) => {
    const existing = store.getState().receivedItems.find((item) =>
      item.transferId === transferId && item.id === fileId
    );
    const reservedView = intent === "view" && isPreviewableReceivedItem(existing) && !existing?.url
      ? reserveBrowserView()
      : null;
    if (existing?.url) {
      openReceivedUrl(view, existing.url, existing, intent);
      return;
    }
    if (!runtime.realTransfer || !transferId || !fileId) return;
    try {
      const preferBlob = intent === "view" && isPreviewableReceivedItem(existing);
      const exported = await transfer.storage.exportFile(fileId, { sessionId: transferId, preferBlob });
      if (exported?.openUnavailable) {
        reservedView?.close?.();
        view.toast(view.translate("downloadSaved"));
        return;
      }
      if (!exported?.blob) {
        reservedView?.close?.();
        return;
      }
      const url = URL.createObjectURL(exported.blob);
      const receivedItem = {
        ...existing,
        name: exported.name || existing?.name,
        downloadName: exported.name || existing?.downloadName,
        type: exported.type || existing?.type
      };
      store.update((state) => ({
        ...state,
        receivedItems: state.receivedItems.map((item) => (
          item.transferId === transferId && item.id === fileId
            ? { ...item, url, status: "ready", canSave: true }
            : item
        ))
      }));
      openReceivedUrl(view, url, receivedItem, intent, reservedView);
    } catch {
      reservedView?.close?.();
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
    if (!isAllowedAvatarChoice(avatar)) return;
    localStorage.setItem("webdrop.avatarChoice", avatar);
    store.update((state) => ({ ...state, self: { ...state.self, avatar, avatarId: avatar } }));
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

  view.on("connect-nearby", startNearbyConnectionFromUi);

  view.on("island-retry", async () => {
    await view.closeDynamicIsland();
    startNearbyConnectionFromUi();
  });

  function startNearbyConnectionFromUi() {
    if (pendingAdminMonitor) {
      ensureProximityPermissions().then(() => {
        if (!tryStartAdminAcousticMonitor()) {
          view.toast(view.translate("diagnosticPermissionFailed"));
        }
      });
      return;
    }
    if (adminMonitor) {
      view.toast(view.translate("diagnosticAlreadyRunning"));
      return;
    }
    const { connectedPeerId, mode } = store.getState();
    if (mode === "verifying" || mode === "disconnecting") {
      view.toast(view.translate(mode === "verifying" ? "verifying" : "disconnecting"));
      return;
    }
    if (connectedPeerId) {
      const connectedPeer = findPeer(connectedPeerId);
      view.toast(view.translate("alreadyConnected", { name: connectedPeer.name }));
      return;
    }
    activePeerId = null;
    activeConnectionMethod = "proximity";
    const permissionPromise = runtime.realProximityCeremony
      ? ensureProximityPermissions()
      : null;
    beginAnonymousProximityConnection(permissionPromise);
  }

  view.on("connection-bump", () => {
    if (!activePeerId) return;
    activeConnectionMethod = "proximity";
    const permissionPromise = runtime.realProximityCeremony
      ? ensureProximityPermissions()
      : null;
    beginActiveConnection(permissionPromise);
  });

  view.on("connection-qr", async () => {
    const peer = findPeer(activePeerId);
    if (!peer) return;
    activeConnectionMethod = "qr";
    await view.closeConnectionMethodSheet?.();
    view.openQrChoiceSheet(peer, {
      incoming: incomingInvite?.method === "qr" && incomingInvite.peerId === peer.id,
      suggestedRole: incomingInvite?.qrRole === "show" ? "scan" : "show"
    });
  });

  view.on("connect-qr", () => {
    const { connectedPeerId, mode } = store.getState();
    if (mode === "verifying" || mode === "disconnecting") {
      view.toast(view.translate(mode === "verifying" ? "verifying" : "disconnecting"));
      return;
    }
    if (connectedPeerId) {
      const connectedPeer = findPeer(connectedPeerId);
      view.toast(view.translate("alreadyConnected", { name: connectedPeer.name }));
      return;
    }
    const peerId = incomingInvite?.method === "qr" ? incomingInvite.peerId : null;
    const peer = peerId ? findPeer(peerId) : anonymousPeer();
    if (!peer) {
      view.toast(view.translate("connectionRejected"));
      return;
    }
    activePeerId = peerId || null;
    activeConnectionMethod = "qr";
    store.patch({ selectedPeerId: peerId || null });
    view.openQrChoiceSheet(peer, {
      incoming: Boolean(peerId && incomingInvite?.method === "qr" && incomingInvite.peerId === peerId),
      suggestedRole: incomingInvite?.qrRole === "show" ? "scan" : "show"
    });
  });

  view.on("qr-show", () => beginQrConnection("show"));
  view.on("qr-scan", () => {
    view.prepareIslandQrScannerCamera?.();
    beginQrConnection("scan");
  });

  function beginQrConnection(role) {
    const peerId = incomingInvite?.method === "qr"
      ? incomingInvite.peerId
      : activePeerId;
    const peer = peerId ? findPeer(peerId) : null;
    if (!peerId) {
      activeConnectionMethod = "qr";
      activeQrRole = normalizeQrRole(role) || "show";
      beginPeerlessQrConnection(activeQrRole);
      return;
    }
    if (!peer) {
      view.closeQrChoiceSheet?.();
      view.toast(view.translate("noNearbyForConnection"));
      return;
    }
    activePeerId = peer.id;
    activeConnectionMethod = "qr";
    activeQrRole = normalizeQrRole(role) || "show";
    store.patch({ selectedPeerId: peer.id });
    beginActiveConnection();
  }

  async function beginPeerlessQrConnection(role) {
    const initialState = store.getState();
    if (initialState.mode === "verifying" || initialState.mode === "disconnecting") return;
    failedProximityPeerId = null;
    activePeerId = null;
    activeConnectionMethod = "qr";
    activeQrRole = normalizeQrRole(role) || "show";
    clearQrTransientWaiters();
    store.patch({
      mode: "verifying",
      selectedPeerId: null,
      pendingInviteId: null,
      incomingInvite: null,
      pairingId: null
    });
    await view.closePeerSheet();
    await view.closeConnectionMethodSheet?.();
    await view.closeQrChoiceSheet?.();
    if (store.getState().mode !== "verifying") return;

    const result = await runPeerlessQrPairing(activeQrRole);
    if (store.getState().mode !== "verifying") return;
    if (!result?.passed || !result.peerId || !result.pairingId) {
      view.closeDynamicIsland();
      store.patch({ mode: "lobby", selectedPeerId: null, pendingInviteId: null, incomingInvite: null, pairingId: null });
      view.toast(view.translate(result?.reason === "scan-cancelled" ? "qrCancelled" : "qrInvalid"));
      return;
    }

    const peer = normalizePeer(result.peer || { id: result.peerId, name: view.translate("anonymousNearbyPeer") });
    activePeerId = peer.id;
    store.patch({
      pairingId: result.pairingId,
      pendingInviteId: peer.id,
      peers: upsertPeer(store.getState().peers, peer)
    });
    let path;
    try {
      path = runtime.realTransfer
        ? await connectProductionTransport(peer.id, { initiator: store.getState().self.id < peer.id })
        : await transport.preflight(peer.id);
    } catch (error) {
      console.warn("WebDrop QR transport failed.", {
        message: error?.message || String(error),
        peerId: peer.id,
        pairingId: result.pairingId
      });
      await resetFailedVerification(peer.id);
      return;
    }
    const islandRetracted = await view.finishIslandConnectionTransition();
    if (!islandRetracted || store.getState().mode !== "verifying") return;
    revokeReceivedItemUrls(store.getState().receivedItems);
    store.patch({
      mode: "connected",
      connectedPeerId: peer.id,
      selectedPeerId: peer.id,
      pendingInviteId: null,
      incomingInvite: null,
      path,
      receivedCount: runtime.realTransfer ? 0 : 1,
      receivedItems: runtime.realTransfer ? [] : demoPdfItems(),
      peers: store.getState().peers.map((candidate) =>
        candidate.id === peer.id ? { ...candidate, stage: "near", connected: true } : candidate
      )
    });
    view.pulseConnectionHaptic();
    activeConnectionMethod = "proximity";
    activeQrRole = null;
  }

  view.on("connect-peer", () => {
    const permissionPromise = activeConnectionMethod === "proximity" && runtime.realProximityCeremony
      ? ensureProximityPermissions()
      : null;
    beginActiveConnection(permissionPromise);
  });

  async function beginAnonymousProximityConnection(permissionPromise = null) {
    const initialState = store.getState();
    if (initialState.mode === "verifying" || initialState.mode === "disconnecting") return;
    if (initialState.connectedPeerId) {
      const connectedPeer = findPeer(initialState.connectedPeerId);
      view.toast(view.translate("alreadyConnected", { name: connectedPeer?.name || "peer" }));
      return;
    }
    failedProximityPeerId = null;
    proximitySessionId = null;
    clearProximitySessionWaiters();
    store.patch({
      mode: "verifying",
      selectedPeerId: null,
      pendingInviteId: null,
      incomingInvite: null,
      pairingId: null
    });
    await view.closePeerSheet();
    await view.closeConnectionMethodSheet?.();
    await view.closeQrChoiceSheet?.();
    if (store.getState().mode !== "verifying") return;
    view.showIslandAnonymousConnectionProgress({ self: initialState.self });
    view.toast(view.translate("findingNearbyPeer"));

    if (permissionPromise) await permissionPromise.catch(() => null);
    const acousticStatus = proximity.getAcousticStatus?.() || {};
    const clientNonce = crypto.randomUUID?.() || `nonce-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const joined = waitForProximitySessionJoined(10000);
    await signaling.joinProximitySession?.({
      clientNonce,
      acousticCapabilities: {
        sampleRate: acousticStatus.sampleRate || null,
        strictInaudible: true
      }
    });
    const joinedPayload = await joined;
    const sessionId = joinedPayload?.sessionId;
    if (!sessionId || !isCurrentAnonymousVerification()) {
      await failAnonymousVerification({ score: 0, errors: [view.translate("proximityErrorSync")] });
      return;
    }
    proximitySessionId = sessionId;
    const startPayload = await waitForProximitySessionStart(sessionId, 30000);
    if (!startPayload || !isCurrentProximitySession(sessionId)) {
      await failAnonymousVerification({ score: 0, errors: [view.translate("proximityErrorSync")] });
      return;
    }
    if (!runtime.realProximityCeremony) {
      await wait(Math.max(0, Number(startPayload.startAt) - Date.now() + 50));
    }

    let result;
    try {
      result = runtime.realProximityCeremony
        ? await runRealProximitySessionCeremony(startPayload, permissionPromise, (phase, detail) => (
          sendProximitySessionDiagnostic(startPayload, phase, { ...detail, clientNonce })
        ))
        : {
          passed: true,
          score: 100,
          metrics: {
            peerId: "anonymous-session",
            method: "mock-physical-session",
            acoustic: true,
            soundCorrelation: 1,
            acousticSignatureId: startPayload.acousticSignatureId || null,
            heardAcousticSignatureId: startPayload.acousticPlan?.find(
              (signature) => signature.id !== startPayload.acousticSignatureId
            )?.id || null,
            acousticConfidenceMargin: 1,
            acousticRunnerUpCorrelation: 0,
            acousticDetections: startPayload.acousticPlan
              ?.filter((signature) => signature.id !== startPayload.acousticSignatureId)
              .slice(0, 1)
              .map((signature) => ({
                signatureId: signature.id,
                correlation: 1,
                marginDb: 30,
                sampleOffset: 1
              })) || [],
            motionCorrelation: 1,
            bump: true,
            tilt: true,
            lowRttHint: true
          },
          evidence: { motion: { bumpAt: Date.now(), bump: true, tilted: true } },
          reason: "mock-physical-session"
        };
    } catch (error) {
      sendProximitySessionDiagnostic(startPayload, "ceremony:exception", {
        clientNonce,
        state: "failed",
        reason: error?.name || "exception",
        message: error?.message || "Ceremony failed before telemetry."
      });
      const motion = proximity.getSnapshot?.().motion || {};
      result = {
        passed: false,
        score: 0,
        metrics: {
          tokenFresh: Boolean(startPayload.sessionId),
          acoustic: false,
          soundCorrelation: 0,
          acousticEmitted: false,
          acousticDetected: false,
          acousticReason: "ceremony_exception",
          acousticSignatureId: startPayload.acousticSignatureId || null,
          acousticSlot: startPayload.acousticSlot,
          acousticSlotCount: startPayload.acousticPlan?.length || 0,
          acousticStartFrequencyHz: startPayload.acousticPlan?.[startPayload.acousticSlot || 0]?.startFrequencyHz || null,
          acousticEndFrequencyHz: startPayload.acousticPlan?.[startPayload.acousticSlot || 0]?.endFrequencyHz || null,
          motionCorrelation: motion.bump && motion.tilted ? 1 : motion.samples > 0 ? 0.4 : 0,
          bump: Boolean(motion.bump),
          tilt: Boolean(motion.tilted),
          microphonePermission: "ceremony-exception",
          audioOutputPermission: "ceremony-exception",
          motionPermission: "ceremony-exception",
          sessionId
        },
        evidence: { motion },
        reason: "ceremony-exception"
      };
    }
    if (!isCurrentProximitySession(sessionId)) return;
    const match = waitForProximityMatch(sessionId, 30000);
    sendProximitySessionDiagnostic(startPayload, "ceremony:before-telemetry", {
      clientNonce,
      state: result.passed ? "passed" : "failed",
      reason: result.reason,
      acoustic: {
        mode: result.metrics?.acousticDetectionMethod || result.metrics?.acousticReason || null,
        slot: result.metrics?.acousticSlot,
        slotCount: result.metrics?.acousticSlotCount,
        signatureId: result.metrics?.heardAcousticSignatureId,
        correlation: result.metrics?.acousticCorrelation || result.metrics?.soundCorrelation,
        marginDb: result.metrics?.acousticMarginDb,
        startFrequencyHz: result.metrics?.acousticStartFrequencyHz,
        endFrequencyHz: result.metrics?.acousticEndFrequencyHz
      },
      motion: result.evidence?.motion
    });
    await signaling.sendProximitySessionTelemetry?.({
      sessionId,
      clientNonce,
      metrics: result.metrics,
      timing: {
        startedAt: startPayload.startAt,
        bumpAt: result.evidence?.motion?.bumpAt || Date.now(),
        completedAt: Date.now()
      }
    });
    const matchPayload = await match;
    if (!matchPayload?.peerId || !matchPayload?.pairingId || !isCurrentProximitySession(sessionId)) {
      await failAnonymousVerification({
        score: result?.score || 0,
        errors: proximityFailureMessages(result, { analysis: { score: (result?.score || 0) / 100 } })
      });
      return;
    }

    const peer = normalizePeer(matchPayload.peer || { id: matchPayload.peerId, name: view.translate("anonymousNearbyPeer") });
    activePeerId = peer.id;
    store.patch({
      pairingId: matchPayload.pairingId,
      pendingInviteId: peer.id,
      peers: upsertPeer(store.getState().peers, peer)
    });
    view.showIslandConnectionProgress({
      self: store.getState().self,
      peer,
      ceremony: verifiedCeremonySnapshot(result)
    });
    let path;
    try {
      path = runtime.realTransfer
        ? await connectProductionTransport(peer.id, { initiator: store.getState().self.id < peer.id })
        : await transport.preflight(peer.id);
    } catch (error) {
      console.warn("WebDrop matched transport failed.", {
        message: error?.message || String(error),
        peerId: peer.id,
        pairingId: matchPayload.pairingId
      });
      await resetFailedVerification(peer.id);
      return;
    }
    const islandRetracted = await view.finishIslandConnectionTransition();
    if (!islandRetracted || !isCurrentProximitySession(sessionId)) return;
    revokeReceivedItemUrls(store.getState().receivedItems);
    store.patch({
      mode: "connected",
      connectedPeerId: peer.id,
      selectedPeerId: peer.id,
      pendingInviteId: null,
      incomingInvite: null,
      path,
      receivedCount: runtime.realTransfer ? 0 : 1,
      receivedItems: runtime.realTransfer ? [] : demoPdfItems(),
      peers: store.getState().peers.map((candidate) =>
        candidate.id === peer.id ? { ...candidate, stage: "near", connected: true } : candidate
      )
    });
    view.pulseConnectionHaptic();
    activeConnectionMethod = "proximity";
    activeQrRole = null;
    proximitySessionId = null;
    clearProximitySessionWaiters();
  }

  async function beginActiveConnection(permissionPromise = null) {
    if (!activePeerId) return;
    failedProximityPeerId = null;
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
    const useQrPairing = runtime.qrPairing && activeConnectionMethod === "qr";
    if (acceptingIncoming && !runtime.productionSignaling) {
      const invite = incomingInvite;
      incomingInvite = null;
      await signaling.acceptInvite?.(peerId, invite.pairingId);
    }
    store.patch({ mode: "verifying", pendingInviteId: peerId, incomingInvite: null });
    await view.closePeerSheet();
    await view.closeConnectionMethodSheet?.();
    await view.closeQrChoiceSheet?.();
    if (!isCurrentVerification(peerId)) return;
    if (useQrPairing) {
      view.showIslandQrPreparing({ self: initialState.self, peer, role: activeQrRole });
    } else {
      view.showIslandConnectionProgress({ self: initialState.self, peer });
      view.toast(view.translate("proximityPrompt"));
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
        ? await runQrPairing(peerId, activeQrRole || (productionInitiator ? "show" : "scan"))
        : runtime.realProximityCeremony
          ? await runRealProximityCeremony(peerId, permissionPromise)
          : bypassProximityForTransferTest(peerId);
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
      if (!verifiedByQr) {
        await view.showIslandVerificationFailure({
          score: result?.score || percentageScore(decision?.analysis?.score),
          errors: proximityFailureMessages(result, decision)
        });
        failedProximityPeerId = peerId;
      } else {
        view.closeDynamicIsland();
        failedProximityPeerId = null;
      }
      if (runtime.productionSignaling && pairingId) {
        suppressDisconnectToast = true;
        await signaling.disconnectPeer?.(peerId, pairingId);
      }
      store.patch({
        mode: "lobby",
        selectedPeerId: !verifiedByQr ? peerId : null,
        pendingInviteId: null,
        incomingInvite: null,
        pairingId: null
      });
      view.toast(view.translate(verifiedByQr ? "qrInvalid" : "proximityScoreFailed", {
        score: Math.round(result?.score || percentageScore(decision?.analysis?.score))
      }));
      return;
    }
    let path;
    try {
      path = runtime.realTransfer
        ? await connectProductionTransport(peerId, { initiator: productionInitiator })
        : await transport.preflight(peerId);
    } catch (error) {
      console.warn("WebDrop connection transport failed.", {
        message: error?.message || String(error),
        peerId,
        pairingId: store.getState().pairingId
      });
      await resetFailedVerification(peerId);
      return;
    }
    if (!isCurrentVerification(peerId)) return;
    const islandRetracted = await view.finishIslandConnectionTransition();
    if (!islandRetracted || !isCurrentVerification(peerId)) return;
    revokeReceivedItemUrls(store.getState().receivedItems);
    store.patch({
      mode: "connected",
      connectedPeerId: peerId,
      pendingInviteId: null,
      incomingInvite: null,
      path,
      receivedCount: runtime.realTransfer ? 0 : 1,
      receivedItems: runtime.realTransfer ? [] : demoPdfItems(),
      peers: store.getState().peers.map((candidate) =>
        candidate.id === peerId ? { ...candidate, stage: "near" } : candidate
      )
    });
    view.pulseConnectionHaptic();
    activeConnectionMethod = "proximity";
    activeQrRole = null;
    failedProximityPeerId = null;
  }

  view.on("choose-files", () => view.openFilePicker());

  view.on("files-selected", (files) => {
    const limited = [...files];
    const totalBytes = limited.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > TRANSFER_SESSION_CAP_BYTES) {
      view.toast(view.translate("transferSessionLimit", { size: formatBytes(TRANSFER_SESSION_CAP_BYTES) }));
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
    const { files, connectedPeerId, pairingId } = state;
    if (!connectedPeerId || state.mode !== "connected") {
      view.toast(view.translate("connectFirst"));
      return;
    }
    if (!files.length) {
      view.openFilePicker();
      return;
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > TRANSFER_SESSION_CAP_BYTES) {
      view.toast(view.translate("transferSessionLimit", { size: formatBytes(TRANSFER_SESSION_CAP_BYTES) }));
      return;
    }
    try {
      store.patch({
        transfer: {
          direction: "send",
          stage: "preparing",
          name: files[0]?.name || "",
          ratio: 0,
          transferredBytes: 0,
          totalBytes
        }
      });
      await transfer.send(files, {
        peerId: connectedPeerId,
        pairingId,
        onProgress(progress) {
          if (!isActiveConnection(connectedPeerId, pairingId)) return;
          scheduleTransferPatch({ ...progress, direction: "send" });
        }
      });
    } catch {
      if (!isActiveConnection(connectedPeerId, pairingId)) return;
      cancelPendingTransferPatch();
      if (store.getState().transfer?.direction === "send") store.patch({ transfer: null });
      view.toast(view.translate("transferFailed"));
      return;
    }
    if (!isActiveConnection(connectedPeerId, pairingId)) return;
    cancelPendingTransferPatch();
    const completedTransfer = store.getState().transfer;
    if (completedTransfer?.direction === "send") {
      store.patch({
        transfer: {
          ...completedTransfer,
          stage: "complete",
          ratio: 1,
          transferredBytes: completedTransfer.totalBytes || totalBytes
        }
      });
      await wait(1200);
      if (!isActiveConnection(connectedPeerId, pairingId)) return;
    }
    if (runtime.realTransfer) {
      const currentTransfer = store.getState().transfer;
      store.patch({
        transfer: currentTransfer?.direction === "send" ? null : currentTransfer,
        files: []
      });
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
        ],
        unreadChatCount: view.isChatSheetOpen?.() ? current.unreadChatCount : (current.unreadChatCount || 0) + 1
      }));
    }, 560);
  });

  view.on("disconnect", async () => {
    const current = store.getState();
    if (!current.connectedPeerId || current.mode === "disconnecting") return;
    view.pulseDisconnectHaptic();
    cancelPendingTransferPatch();
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
      revokeReceivedItemUrls(store.getState().receivedItems);
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
        chatMessages: [],
        unreadChatCount: 0
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
    clearProximitySessionWaiters();
    if (proximitySessionId) await signaling.cancelProximitySession?.(proximitySessionId);
    proximitySessionId = null;
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
    activeQrRole = null;
    view.toast(view.translate("qrCancelled"));
  });

  view.on("island-fallback", async () => {
    const current = store.getState();
    if (current.mode !== "verifying") {
      const peerId = failedProximityPeerId || activePeerId || current.selectedPeerId || null;
      const peer = peerId ? findPeer(peerId) : anonymousPeer();
      failedProximityPeerId = null;
      activePeerId = peerId || null;
      activeConnectionMethod = "qr";
      activeQrRole = null;
      store.patch({ selectedPeerId: peerId, pendingInviteId: null, incomingInvite: null, pairingId: null });
      await view.closeDynamicIsland();
      view.openQrChoiceSheet(peer, { suggestedRole: "show" });
      view.toast(view.translate("qrInfo"));
      return;
    }
    if (current.pendingInviteId && current.pairingId) {
      await signaling.sendProximityFallback?.(current.pendingInviteId, current.pairingId);
    }
    qrFallbackResolver?.();
    qrFallbackResolver = null;
    view.closeDynamicIsland();
  });

  async function runRealProximityCeremony(peerId, permissionPromise) {
    view.updateIslandCeremony({ phase: "permissions", state: "active" });
    const {
      microphone: microphonePermission,
      motion: motionPermission,
      audioOutput: audioOutputPermission
    } = await (
      permissionPromise || ensureProximityPermissions()
    );
    view.updateIslandCeremony({
      phase: "permissions",
      state: microphonePermission.granted && motionPermission.granted && audioOutputPermission.granted ? "complete" : "failed",
      permissions: {
        microphone: microphonePermission,
        motion: motionPermission,
        audioOutput: audioOutputPermission
      }
    });
    proximity.resetMotionCapture();
    if (motionPermission.granted) proximity.startMotionCapture();
    let motionTimer = 0;
    try {
      const pairingId = store.getState().pairingId;
      view.updateIslandCeremony({ phase: "sync", state: "active" });
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
      motionTimer = globalThis.setInterval(() => {
        view.updateIslandCeremony({
          phase: "motion",
          state: "active",
          motion: proximity.getSnapshot().motion
        });
      }, 120);
      const result = await proximity.runRealCeremony({
        acoustic: microphonePermission.granted && audioOutputPermission.granted,
        acousticRole: store.getState().self.id < peerId ? "emit" : "detect",
        startAt: start.startAt,
        ceremonyDurationMs: start.durationMs,
        tokenFresh: Boolean(pairingId),
        onProgress: (progress) => view.updateIslandCeremony(progress)
      });
      return {
        ...result,
        metrics: {
          ...result.metrics,
          microphonePermission: microphonePermission.reason || (microphonePermission.granted ? "granted" : "denied"),
          audioOutputPermission: audioOutputPermission.reason || (audioOutputPermission.granted ? "granted" : "denied"),
          motionPermission: motionPermission.reason || (motionPermission.granted ? "granted" : "denied"),
          peerId
        }
      };
    } finally {
      globalThis.clearInterval(motionTimer);
      stopProximitySensors();
    }
  }

  async function runRealProximitySessionCeremony(startPayload, permissionPromise, emitDiagnostic = () => {}) {
    view.updateIslandCeremony({ phase: "permissions", state: "active" });
    emitDiagnostic("permissions:request", { state: "active" });
    const {
      microphone: microphonePermission,
      motion: motionPermission,
      audioOutput: audioOutputPermission
    } = await (
      permissionPromise || ensureProximityPermissions()
    );
    view.updateIslandCeremony({
      phase: "permissions",
      state: microphonePermission.granted && motionPermission.granted && audioOutputPermission.granted ? "complete" : "failed",
      permissions: {
        microphone: microphonePermission,
        motion: motionPermission,
        audioOutput: audioOutputPermission
      }
    });
    emitDiagnostic("permissions:complete", {
      state: microphonePermission.granted && motionPermission.granted && audioOutputPermission.granted ? "complete" : "failed",
      reason: [
        microphonePermission.granted ? null : `microphone:${microphonePermission.reason || "denied"}`,
        motionPermission.granted ? null : `motion:${motionPermission.reason || "denied"}`,
        audioOutputPermission.granted ? null : `audioOutput:${audioOutputPermission.reason || "denied"}`
      ].filter(Boolean).join(",") || null
    });
    proximity.resetMotionCapture();
    if (motionPermission.granted) proximity.startMotionCapture();
    let motionTimer = 0;
    try {
      view.updateIslandCeremony({ phase: "sync", state: "active" });
      emitDiagnostic("ceremony:sync", {
        state: "active",
        timing: {
          startAt: startPayload.startAt
        }
      });
      motionTimer = globalThis.setInterval(() => {
        view.updateIslandCeremony({
          phase: "motion",
          state: "active",
          motion: proximity.getSnapshot().motion
        });
      }, 120);
      const result = await proximity.runRealCeremony({
        acoustic: microphonePermission.granted && audioOutputPermission.granted,
        acousticPlan: startPayload.acousticPlan,
        acousticSignatureId: startPayload.acousticSignatureId,
        startAt: startPayload.startAt,
        ceremonyDurationMs: startPayload.durationMs,
        tokenFresh: Boolean(startPayload.sessionId),
        onProgress: (progress) => {
          view.updateIslandCeremony(progress);
          if (progress?.phase === "audio") {
            emitDiagnostic(`audio:${progress.acoustic?.mode || "progress"}`, {
              state: progress.state || "active",
              acoustic: progress.acoustic
            });
          }
        }
      });
      emitDiagnostic("ceremony:complete", {
        state: result.passed ? "passed" : "failed",
        reason: result.reason,
        acoustic: {
          mode: result.metrics?.acousticDetectionMethod || result.metrics?.acousticReason || null,
          slot: result.metrics?.acousticSlot,
          slotCount: result.metrics?.acousticSlotCount,
          signatureId: result.metrics?.heardAcousticSignatureId,
          correlation: result.metrics?.acousticCorrelation || result.metrics?.soundCorrelation,
          marginDb: result.metrics?.acousticMarginDb,
          startFrequencyHz: result.metrics?.acousticStartFrequencyHz,
          endFrequencyHz: result.metrics?.acousticEndFrequencyHz
        },
        motion: result.evidence?.motion
      });
      return {
        ...result,
        metrics: {
          ...result.metrics,
          microphonePermission: microphonePermission.reason || (microphonePermission.granted ? "granted" : "denied"),
          audioOutputPermission: audioOutputPermission.reason || (audioOutputPermission.granted ? "granted" : "denied"),
          motionPermission: motionPermission.reason || (motionPermission.granted ? "granted" : "denied"),
          sessionId: startPayload.sessionId,
          acousticSlot: startPayload.acousticSlot
        }
      };
    } finally {
      globalThis.clearInterval(motionTimer);
      stopProximitySensors();
    }
  }

  function sendProximitySessionDiagnostic(startPayload = {}, phase, detail = {}) {
    const sessionId = startPayload.sessionId || proximitySessionId;
    if (!sessionId || !phase) return false;
    return signaling.sendProximitySessionDiagnostic?.({
      sessionId,
      clientNonce: detail.clientNonce || startPayload.clientNonce || null,
      phase,
      state: detail.state || null,
      reason: detail.reason || null,
      message: detail.message || null,
      acoustic: detail.acoustic || null,
      motion: detail.motion || null,
      timing: {
        ...(detail.timing || {}),
        at: Date.now(),
        startAt: startPayload.startAt || detail.timing?.startAt || null
      }
    });
  }

  async function failAnonymousVerification({ score = 0, errors = [] } = {}) {
    const sessionId = proximitySessionId;
    stopProximitySensors();
    clearProximitySessionWaiters();
    if (sessionId) await signaling.cancelProximitySession?.(sessionId).catch(() => {});
    proximitySessionId = null;
    await view.showIslandVerificationFailure({
      score,
      errors: errors.length ? errors : [view.translate("proximityMatchFailed")]
    });
    store.patch({
      mode: "lobby",
      selectedPeerId: null,
      pendingInviteId: null,
      incomingInvite: null,
      pairingId: null
    });
    activePeerId = null;
    failedProximityPeerId = null;
    activeConnectionMethod = "proximity";
    activeQrRole = null;
    view.toast(view.translate("proximityScoreFailed", { score: Math.round(score) }));
  }

  function ensureProximityPermissions() {
    if (permissionRequestPromise) return permissionRequestPromise;
    // Start both native prompts before yielding so every iPhone browser keeps user activation.
    const motionPromise = ["denied", "unsupported"].includes(storedPermissions.motion)
      ? Promise.resolve({ granted: false, reason: storedPermissions.motion, cached: true })
      : proximity.requestMotionPermission();
    const audioOutputPromise = proximity.prepareAudioOutput();
    const microphonePromise = storedPermissions.microphone === "denied"
      ? Promise.resolve({ granted: false, reason: "denied", cached: true })
      : proximity.requestMicrophonePermission({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });
    permissionRequestPromise = Promise.all([motionPromise, audioOutputPromise, microphonePromise]).then(([
      motion,
      audioOutput,
      microphone
    ]) => {
      storedPermissions.microphone = permissionState(microphone);
      storedPermissions.motion = permissionState(motion);
      writeStoredPermissions(storedPermissions);
      return { microphone, motion, audioOutput };
    }).finally(() => {
      permissionRequestPromise = null;
    });
    return permissionRequestPromise;
  }

  function stopProximitySensors() {
    proximity.stopMotionCapture();
    proximity.stopAcousticCapture({ releaseStream: false });
    if (pendingAdminMonitor) {
      globalThis.setTimeout(() => tryStartAdminAcousticMonitor(), 180);
    }
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
    await signaling.sendInvite(peerId, {
      method: activeConnectionMethod,
      qrRole: activeConnectionMethod === "qr" ? activeQrRole : null
    });
    const pairing = await accepted;
    return pairing ? { ...pairing, initiator: true } : null;
  }

  async function runQrPairing(peerId, role) {
    try {
      const state = store.getState();
      const pairingId = state.pairingId;
      const peer = findPeer(peerId);
      if (!pairingId || !peer) return failedQrResult("missing-pairing");
      const cancelled = waitForQrCancel();
      const fallback = waitForQrFallback();

      if (role === "show") {
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
        score: 100,
        metrics: { peerId, method: "qr", pairingId },
        evidence: { qrVerified: true },
        reason: "qr-verified"
      };
    } finally {
      clearQrTransientWaiters();
    }
  }

  async function runPeerlessQrPairing(role) {
    const peer = anonymousPeer();
    const state = store.getState();
    const cancelled = waitForQrCancel();
    const fallback = waitForQrFallback();
    try {
      if (role === "show") {
        view.showIslandQrPreparing({ self: state.self, peer, role });
        const issued = waitForPeerlessQrIssued(15000);
        await signaling.issuePeerlessQrToken?.();
        const payload = await Promise.race([issued, cancelled, fallback]);
        if (payload?.fallback) return failedQrResult("qr-fallback-requested");
        if (!payload?.token) return failedQrResult("issue-failed");
        view.showIslandQrDisplay({ self: state.self, peer, token: payload.token });
        const verified = waitForPeerlessQrVerified(payload.pairingId, 120000);
        const result = await Promise.race([verified, cancelled, fallback]);
        if (result?.fallback) return failedQrResult("qr-fallback-requested");
        if (!result?.valid) return failedQrResult("verification-failed");
        return peerlessQrSuccess(result);
      }

      view.showIslandQrScanner({ self: state.self, peer });
      while (store.getState().mode === "verifying") {
        const token = await Promise.race([waitForQrScan(120000), cancelled, fallback]);
        if (token?.fallback) return failedQrResult("qr-fallback-requested");
        if (!token) return failedQrResult("scan-cancelled");
        const verified = waitForPeerlessQrVerified(null, 15000);
        await signaling.verifyPeerlessQrToken?.(token);
        const result = await Promise.race([verified, cancelled, fallback]);
        if (result?.fallback) return failedQrResult("qr-fallback-requested");
        if (result?.valid) return peerlessQrSuccess(result);
        view.retryIslandQrScanner();
      }
      return failedQrResult("scan-cancelled");
    } finally {
      clearQrTransientWaiters();
    }
  }

  function peerlessQrSuccess(result) {
    return {
      passed: true,
      score: 100,
      pairingId: result.pairingId,
      peerId: result.peerId,
      peer: result.peer,
      metrics: { peerId: result.peerId, method: "peerless-qr", pairingId: result.pairingId },
      evidence: { qrVerified: true },
      reason: "qr-verified"
    };
  }

  function bypassProximityForTransferTest(peerId) {
    return {
      passed: true,
      score: 100,
      metrics: {
        peerId,
        method: "disabled-for-transfer-test",
        acoustic: false,
        tilt: false,
        bump: false,
        qrFallback: false,
        lowRttHint: true
      },
      evidence: {},
      reason: "proximity-disabled"
    };
  }

  function waitForQrIssued(pairingId, timeoutMs) {
    return waitForMapValue(qrIssuedWaiters, pairingId, timeoutMs);
  }

  function waitForQrVerified(pairingId, timeoutMs) {
    return waitForMapValue(qrVerifiedWaiters, pairingId, timeoutMs);
  }

  function waitForPeerlessQrIssued(timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        peerlessQrIssuedResolver = null;
        resolve(null);
      }, timeoutMs);
      peerlessQrIssuedResolver = (payload) => {
        clearTimeout(timer);
        peerlessQrIssuedResolver = null;
        resolve(payload);
      };
    });
  }

  function waitForPeerlessQrVerified(expectedPairingId, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        peerlessQrVerifiedResolver = null;
        resolve(null);
      }, timeoutMs);
      peerlessQrVerifiedResolver = (payload) => {
        if (expectedPairingId && payload?.pairingId !== expectedPairingId) return;
        clearTimeout(timer);
        peerlessQrVerifiedResolver = null;
        resolve(payload);
      };
    });
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
    peerlessQrIssuedResolver?.(null);
    peerlessQrIssuedResolver = null;
    peerlessQrVerifiedResolver?.(null);
    peerlessQrVerifiedResolver = null;
  }

  function clearQrTransientWaiters() {
    qrScanResolver = null;
    qrCancelResolver = null;
    qrFallbackResolver = null;
    peerlessQrIssuedResolver = null;
    peerlessQrVerifiedResolver = null;
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
    clearProximitySessionWaiters();
  }

  function waitForProximitySessionJoined(timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proximitySessionJoinedResolver = null;
        resolve(null);
      }, timeoutMs);
      proximitySessionJoinedResolver = (payload) => {
        clearTimeout(timer);
        resolve(payload);
      };
    });
  }

  function waitForProximitySessionStart(sessionId, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proximitySessionStartResolver = null;
        resolve(null);
      }, timeoutMs);
      proximitySessionStartResolver = (payload) => {
        if (payload && payload.sessionId !== sessionId) return;
        clearTimeout(timer);
        resolve(payload);
      };
    });
  }

  function waitForProximityMatch(sessionId, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proximityMatchResolver = null;
        resolve(null);
      }, timeoutMs);
      proximityMatchResolver = (payload) => {
        if (payload && payload.sessionId !== sessionId) return;
        clearTimeout(timer);
        resolve(payload);
      };
    });
  }

  function clearProximitySessionWaiters() {
    proximitySessionJoinedResolver?.(null);
    proximitySessionJoinedResolver = null;
    proximitySessionStartResolver?.(null);
    proximitySessionStartResolver = null;
    proximityMatchResolver?.(null);
    proximityMatchResolver = null;
    proximitySessionFailedResolver?.(null);
    proximitySessionFailedResolver = null;
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
        const terminalFailure = payload?.analysis?.decision && payload.analysis.decision !== "verified";
        if (!payload?.pairVerified && !terminalFailure) return;
        clearTimeout(timer);
        proximityDecisionWaiters.delete(pairingId);
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

  function anonymousPeer() {
    return {
      id: "anonymous-nearby-peer",
      name: view.translate("anonymousNearbyPeer"),
      avatar: store.getState().self.avatar,
      avatarId: store.getState().self.avatar,
      deviceFamily: "ios",
      deviceLabel: "iPhone",
      online: true
    };
  }

  function upsertPeer(peers = [], peer) {
    const normalized = normalizePeer(peer);
    const replaced = peers.map((candidate) => candidate.id === normalized.id ? { ...candidate, ...normalized } : candidate);
    return replaced.some((candidate) => candidate.id === normalized.id) ? replaced : [...replaced, normalized];
  }

  function sanitizePeers(peers = []) {
    const state = store.getState();
    const seen = new Set();
    const byDevice = new Map();
    for (const peer of (Array.isArray(peers) ? peers : [])) {
      if (!peer || typeof peer !== "object") continue;
      const normalized = normalizePeer(peer);
      if (!normalized.id || normalized.id === state.self.id) continue;
      const deviceKey = stablePeerDeviceKey(normalized);
      const existing = byDevice.get(deviceKey);
      if (!existing || peerFreshness(normalized) >= peerFreshness(existing)) byDevice.set(deviceKey, normalized);
    }
    return [...byDevice.values()]
      .filter((peer) => peer && typeof peer === "object")
      .filter((peer) => {
        if (seen.has(peer.id)) return false;
        seen.add(peer.id);
        return true;
      });
  }

  function normalizePeer(peer) {
    const platform = peer.capabilities?.platform || {};
    const family = peer.deviceFamily || platform.family || "unknown";
    return {
      ...peer,
      name: peer.name || peer.deviceName || "WebDrop device",
      avatar: peer.avatar || peer.avatarId,
      avatarId: peer.avatarId || peer.avatar,
      deviceFamily: family,
      deviceLabel: peer.deviceLabel || platform.label || familyLabel(family),
      online: peer.online !== false
    };
  }

  function familyLabel(family) {
    return {
      ios: "iPhone",
      android: "Android",
      macos: "Mac",
      windows: "Windows",
      watchos: "Watch",
      ipad: "iPad"
    }[family] || "Device";
  }

  function stablePeerDeviceKey(peer) {
    if (peer.deviceId) return String(peer.deviceId);
    const id = String(peer.id || "");
    return id.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "");
  }

  function peerFreshness(peer) {
    const joinedAt = Date.parse(peer.joinedAt || "");
    if (Number.isFinite(joinedAt)) return joinedAt;
    return 0;
  }

  function isCurrentVerification(peerId) {
    const state = store.getState();
    return state.mode === "verifying" && state.pendingInviteId === peerId;
  }

  function isCurrentAnonymousVerification() {
    const state = store.getState();
    return state.mode === "verifying" && !state.pendingInviteId && !state.pairingId;
  }

  function isCurrentProximitySession(sessionId) {
    return store.getState().mode === "verifying" && proximitySessionId === sessionId;
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
    if (proximitySessionId) await signaling.cancelProximitySession?.(proximitySessionId).catch(() => {});
    proximitySessionId = null;
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
    activeConnectionMethod = "proximity";
    activeQrRole = null;
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
    activeConnectionMethod = "proximity";
    activeQrRole = null;
  }

  function verifiedCeremonySnapshot(result = {}) {
    const metrics = result.metrics || {};
    const evidenceMotion = result.evidence?.motion || {};
    return {
      score: Number.isFinite(Number(result.score)) ? percentageScore(result.score) : 100,
      acoustic: {
        detected: Boolean(metrics.acoustic || metrics.soundCorrelation || metrics.chirpCorrelation)
      },
      motion: {
        ...evidenceMotion,
        bump: Boolean(evidenceMotion.bump || metrics.bump),
        tilted: Boolean(evidenceMotion.tilted || metrics.tilt),
        samples: evidenceMotion.samples || (metrics.bump || metrics.tilt ? 1 : 0)
      }
    };
  }

  function proximityFailureMessages(result, decision) {
    const messages = [];
    const metrics = result?.metrics || {};
    if (!["granted", undefined].includes(metrics.microphonePermission)) {
      messages.push(view.translate("proximityErrorMicrophone", { reason: metrics.microphonePermission }));
    }
    if (!["running", "granted", undefined].includes(metrics.audioOutputPermission)) {
      messages.push(view.translate("proximityErrorAudioOutput", { reason: metrics.audioOutputPermission }));
    }
    if (!["granted", undefined].includes(metrics.motionPermission)) {
      messages.push(view.translate("proximityErrorMotion", { reason: metrics.motionPermission }));
    }
    if (result?.reason === "ceremony-start-timeout") {
      messages.push(view.translate("proximityErrorSync"));
    }
    if (!metrics.acoustic) messages.push(view.translate("proximityErrorUltrasound"));
    if (!metrics.bump) messages.push(view.translate("proximityErrorBump"));
    if (!metrics.tilt) messages.push(view.translate("proximityErrorTilt"));
    const remoteFailure = decision?.subjectId && decision.subjectId !== store.getState().self.id;
    if (remoteFailure && decision.analysis?.decision !== "verified") {
      messages.push(view.translate("proximityErrorRemote"));
    }
    const score = Math.round(result?.score || percentageScore(decision?.analysis?.score));
    if (score < PROXIMITY_SCORE_MINIMUM) {
      messages.push(view.translate("proximityErrorScore", { score, required: PROXIMITY_SCORE_MINIMUM }));
    }
    return [...new Set(messages)];
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

function normalizeQrRole(role) {
  return role === "show" || role === "scan" ? role : null;
}

function percentageScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? value * 100 : value;
}

function permissionState(result) {
  if (result?.granted) return "granted";
  return ["denied", "unsupported"].includes(result?.reason) ? result.reason : "unknown";
}

function readStoredPermissions() {
  try {
    const value = JSON.parse(localStorage.getItem(PROXIMITY_PERMISSION_KEY) || "{}");
    return {
      microphone: value.microphone || "unknown",
      motion: value.motion || "unknown"
    };
  } catch {
    return { microphone: "unknown", motion: "unknown" };
  }
}

function isAllowedAvatarChoice(avatar) {
  return typeof avatar === "string"
    && (avatar.startsWith("assets/icons/avatars/") || /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(avatar));
}

function writeStoredPermissions(permissions) {
  try {
    localStorage.setItem(PROXIMITY_PERMISSION_KEY, JSON.stringify(permissions));
  } catch {
    // Browsers can disable storage while still allowing a one-session connection.
  }
}

function demoPdfItems() {
  return [
    {
      id: "demo-guide-en",
      transferId: "demo-guide",
      name: "WebDrop Demo Guide EN.pdf",
      size: "Demo PDF",
      icon: "P",
      type: "application/pdf",
      locale: "en",
      url: "output/pdf/webdrop-demo-en.pdf"
    },
    {
      id: "demo-guide-ja",
      transferId: "demo-guide",
      name: "WebDrop デモガイド JP.pdf",
      size: "デモPDF",
      icon: "P",
      type: "application/pdf",
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

function openReceivedUrl(view, url, item = {}, intent = "download", reservedView = null) {
  if (intent === "view" && isPreviewableReceivedItem(item)) {
    const opened = triggerBrowserView(url, reservedView);
    view.toast(view.translate(opened ? "openedNewTab" : "downloadStarted"));
    if (opened) return;
  }
  reservedView?.close?.();
  triggerBrowserDownload(url, item.downloadName || item.name);
  view.toast(view.translate("downloadStarted"));
}

function reserveBrowserView() {
  const opened = window.open("about:blank", "_blank");
  if (opened) opened.opener = null;
  return opened;
}

function triggerBrowserView(url, reservedView = null) {
  if (reservedView && !reservedView.closed) {
    reservedView.location.href = url;
    return true;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(opened);
}

function triggerBrowserDownload(url, name) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name || "webdrop-file";
  anchor.target = "_blank";
  anchor.rel = "noopener";
  anchor.referrerPolicy = "no-referrer";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => anchor.remove(), 1000);
}

function revokeReceivedItemUrls(items = []) {
  for (const item of items) {
    if (!item?.url || !item.url.startsWith("blob:")) continue;
    URL.revokeObjectURL(item.url);
  }
}

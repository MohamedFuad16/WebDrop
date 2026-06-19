import { Emitter } from "../utils/emitter.js?v=1.0.54";
import { formatBytes } from "../utils/format.js?v=1.0.54";
import { AVATAR_OPTIONS, animatedFramesForAvatar, normalizeAvatarChoice } from "../config/avatar-options.js?v=1.0.54";
import { translate } from "../config/i18n.js?v=1.0.54";
import { DynamicIsland } from "./dynamic-island.js?v=1.0.54";

const ORBIT_RADII = [".4324", ".3478", ".2632", ".1786"];
const ORBIT_PEER_LIMIT = 12;
const CONNECTED_ORBIT_PEER_LIMIT = 6;
const CONNECTED_ORBIT_RADII = [
  "calc(var(--orbit-size) * .3478)",
  "calc(var(--orbit-size) * .2632)",
  "calc(var(--orbit-size) * .2162)"
];
const ORBIT_LAYOUT_SLOTS = [
  { ringIndex: 0, angle: 0 },
  { ringIndex: 1, angle: 45 },
  { ringIndex: 2, angle: 85 },
  { ringIndex: 3, angle: 15 },
  { ringIndex: 0, angle: 120 },
  { ringIndex: 1, angle: 165 },
  { ringIndex: 2, angle: 205 },
  { ringIndex: 3, angle: 135 },
  { ringIndex: 0, angle: 240 },
  { ringIndex: 1, angle: 285 },
  { ringIndex: 2, angle: 325 },
  { ringIndex: 3, angle: 255 }
];
const CONNECTED_LAYOUT = [
  { ringIndex: 0, angle: -30 },
  { ringIndex: 0, angle: 150 },
  { ringIndex: 1, angle: 30 },
  { ringIndex: 1, angle: 210 },
  { ringIndex: 2, angle: 90 },
  { ringIndex: 2, angle: 270 }
];

export class AppView extends Emitter {
  constructor(document, store) {
    super();
    this.document = document;
    this.store = store;
    this.nodes = {
      app: document.querySelector("#app"),
      peerOrbits: document.querySelector("[data-peer-orbits]"),
      selfAvatarImage: document.querySelector("[data-self-avatar-image]"),
      avatarCarousel: document.querySelector("[data-avatar-carousel]"),
      ringChoice: document.querySelector("[data-ring-choice]"),
      languageChoice: document.querySelector(".language-choice"),
      motionChoice: document.querySelector(".motion-choice"),
      connectionLabel: document.querySelector("[data-connection-label]"),
      connectNearby: document.querySelector("[data-connect-nearby]"),
      tray: document.querySelector("[data-connection-tray]"),
      connectedPeer: document.querySelector("[data-connected-peer]"),
      disconnectHaptic: document.querySelector("[data-disconnect-haptic]"),
      peerSheet: document.querySelector("[data-peer-sheet]"),
      connectionMethodSheet: document.querySelector("[data-connection-method-sheet]"),
      connectionMethodPeer: document.querySelector("[data-connection-method-peer]"),
      qrSheet: document.querySelector("[data-qr-sheet]"),
      qrSheetPeer: document.querySelector("[data-qr-sheet-peer]"),
      qrSheetCopy: document.querySelector("[data-qr-sheet-copy]"),
      settingsSheet: document.querySelector("[data-settings-sheet]"),
      informationSheet: document.querySelector("[data-information-sheet]"),
      sendSheet: document.querySelector("[data-send-sheet]"),
      receiveSheet: document.querySelector("[data-receive-sheet]"),
      chatSheet: document.querySelector("[data-chat-sheet]"),
      backdrop: document.querySelector("[data-backdrop]"),
      sheetPeerName: document.querySelector("[data-sheet-peer-name]"),
      sheetPeerAvatar: document.querySelector("[data-sheet-peer-avatar]"),
      sheetCopy: document.querySelector("[data-sheet-copy]"),
      peerSheetCancel: document.querySelector("[data-peer-sheet-cancel]"),
      sendTitle: document.querySelector("[data-send-title]"),
      sendCopy: document.querySelector("[data-send-copy]"),
      chatTitle: document.querySelector("[data-chat-title]"),
      chatPanel: document.querySelector("[data-chat-panel]"),
      chatInput: document.querySelector("[data-chat-input]"),
      friendStrip: document.querySelector("[data-friend-strip]"),
      connectButton: document.querySelector("[data-connect-peer]"),
      sendSwipeControl: document.querySelector("[data-send-swipe-control]"),
      sendSwipeThumb: document.querySelector("[data-send-swipe-thumb]"),
      sendSwipeText: document.querySelector("[data-send-swipe-text]"),
      nameInput: document.querySelector("[data-name-input]"),
      currentDevice: document.querySelector("[data-current-device]"),
      fileInput: document.querySelector("[data-file-input]"),
      selectedFiles: document.querySelector("[data-selected-files]"),
      receivedList: document.querySelector("[data-received-list]"),
      receiveBadge: document.querySelector("[data-receive-badge]"),
      chatBadge: document.querySelector("[data-chat-badge]"),
      qrPreviewToggle: document.querySelector("[data-qr-preview-toggle]"),
      toast: document.querySelector("[data-toast]")
    };
    this.sheetHideTimers = new WeakMap();
    this.backdropTimer = null;
    this.lastFocusedBeforeSheet = null;
    this.sheetBackgroundNodes = [
      document.querySelector(".topbar"),
      document.querySelector(".main-stage"),
      document.querySelector(".nearby-fab"),
      document.querySelector("[data-connection-tray]"),
      document.querySelector("[data-dynamic-island]")
    ].filter(Boolean);
    this.avatarOptionsRendered = false;
    this.peerRenderSignature = "";
    this.receivedRenderSignature = "";
    this.chatRenderSignature = "";
    this.lastChatMessageCount = 0;
    this.dynamicIsland = new DynamicIsland(document, (key, params) => this.translate(key, params));
    this.dynamicIsland.on("detected", (token) => this.emit("island-qr-detected", token));
    this.dynamicIsland.on("cancel", () => {
      if (this.qrPreviewActive) {
        this.closeQrScannerPreview();
        return;
      }
      this.emit("island-cancel");
    });
    this.dynamicIsland.on("retry", () => this.emit("island-retry"));
    this.dynamicIsland.on("fallback", () => this.emit("island-fallback"));
    this.preloadCriticalAssets();
    this.bindEvents();
    this.bindSwipeControls();
    store.subscribe((state) => this.render(state));
  }

  preloadCriticalAssets() {
    const firstFrames = AVATAR_OPTIONS
      .flatMap((avatar) => animatedFramesForAvatar(avatar).slice(0, 1))
      .filter(Boolean);
    [...new Set(firstFrames)].forEach(preloadImage);
  }

  bindEvents() {
    this.document.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      const action = actionTarget?.dataset.action;
      if (!action) return;
      if (action === "select-avatar") {
        this.emit(action, actionTarget.dataset.avatar);
        return;
      }
      if (action === "select-ring") {
        this.emit(action, actionTarget.dataset.ring);
        return;
      }
      if (action === "open-received") {
        this.emit(action, {
          transferId: actionTarget.dataset.transferId,
          fileId: actionTarget.dataset.fileId,
          intent: actionTarget.dataset.receivedIntent || "download"
        });
        return;
      }
      if (!this.listeners.has(action) && this.handleLocalAction(action)) return;
      this.emit(action);
    });

    this.nodes.nameInput.addEventListener("input", (event) => {
      this.emit("name-change", event.target.value);
    });

    this.nodes.fileInput.addEventListener("change", (event) => {
      this.emit("files-selected", event.target.files);
      event.target.value = "";
    });

    this.nodes.disconnectHaptic?.addEventListener("change", () => {
      window.requestAnimationFrame(() => {
        this.nodes.disconnectHaptic.checked = false;
      });
    });

    this.document.addEventListener("keydown", (event) => {
      const sheet = this.visibleSheet();
      if (!sheet) return;
      if (event.key === "Escape") {
        event.preventDefault();
        this.emit("close-all-sheets");
        return;
      }
      if (event.key === "Tab") this.trapSheetFocus(event, sheet);
    });
  }

  bindSwipeControls() {
    this.resetSendSwipe = this.bindSwipe({
      control: this.nodes.sendSwipeControl,
      thumb: this.nodes.sendSwipeThumb,
      text: this.nodes.sendSwipeText,
      axis: "y",
      defaultText: "swipeSend",
      completeText: "sending",
      eventName: "swipe-send"
    });
  }

  bindSwipe({ control, thumb, text, axis, defaultText, completeText, eventName, hapticSwitch = null }) {
    let dragging = false;
    let startPosition = 0;
    let maxDistance = 0;
    let currentDistance = 0;
    let allowHapticToggle = false;
    let dragStartedOnHapticSwitch = false;
    let defaultTextKey = defaultText;
    let completeTextKey = completeText;
    const isControlDisabled = () => thumb.disabled || control.getAttribute("aria-disabled") === "true";
    const setX = (value) => {
      currentDistance = Math.max(0, Math.min(maxDistance, value));
      control.style.setProperty("--swipe-x", `${axis === "x" ? currentDistance : 0}px`);
      control.style.setProperty("--swipe-y", `${axis === "y" ? currentDistance * -1 : 0}px`);
    };
    const reset = (copy = {}) => {
      defaultTextKey = copy.defaultText || defaultTextKey;
      completeTextKey = copy.completeText || completeTextKey;
      control.classList.remove("is-complete", "is-dragging");
      text.textContent = this.translate(defaultTextKey);
      setX(0);
    };
    const getPosition = (event) => axis === "x" ? event.clientX : event.clientY;
    const start = (event) => {
      if (!event) return;
      if (isControlDisabled()) return;
      dragStartedOnHapticSwitch = event.target === hapticSwitch;
      if (!dragStartedOnHapticSwitch) event.preventDefault();
      dragging = true;
      control.classList.add("is-dragging");
      const controlBox = control.getBoundingClientRect();
      const thumbBox = thumb.getBoundingClientRect();
      maxDistance = axis === "x"
        ? Math.max(0, controlBox.width - thumbBox.width - 12)
        : Math.max(0, controlBox.height - thumbBox.height - 12);
      const position = getPosition(event);
      if (event.target !== thumb && !dragStartedOnHapticSwitch) {
        const trackDistance = axis === "x"
          ? position - controlBox.left - thumbBox.width / 2
          : controlBox.bottom - position - thumbBox.height / 2;
        setX(trackDistance);
      }
      startPosition = position - (axis === "x" ? currentDistance : -currentDistance);
      try {
        (dragStartedOnHapticSwitch ? hapticSwitch : control).setPointerCapture?.(event.pointerId);
      } catch {
        // Some synthetic QA gestures do not create an active pointer capture target.
      }
    };
    const move = (event) => {
      if (!dragging || isControlDisabled()) return;
      event.preventDefault();
      const delta = getPosition(event) - startPosition;
      setX(axis === "x" ? delta : -delta);
    };
    const complete = () => {
      if (isControlDisabled()) return;
      if (control.classList.contains("is-complete")) return;
      allowHapticToggle = true;
      control.classList.add("is-complete");
      text.textContent = this.translate(completeTextKey);
      setX(maxDistance);
      this.emit(eventName);
      window.setTimeout(reset, 900);
    };
    const end = (event) => {
      if (!dragging) return;
      const completed = currentDistance >= maxDistance * .78;
      if (!(completed && dragStartedOnHapticSwitch)) event?.preventDefault?.();
      dragging = false;
      control.classList.remove("is-dragging");
      if (completed) {
        complete();
        return;
      }
      allowHapticToggle = false;
      dragStartedOnHapticSwitch = false;
      reset();
    };
    hapticSwitch?.addEventListener("click", (event) => {
      if (!allowHapticToggle) event.preventDefault();
      allowHapticToggle = false;
    });
    hapticSwitch?.addEventListener("change", () => {
      window.requestAnimationFrame(() => {
        hapticSwitch.checked = false;
      });
    });
    control.addEventListener("pointerdown", start);
    control.addEventListener("pointermove", move);
    control.addEventListener("pointerup", end);
    control.addEventListener("pointercancel", end);
    control.addEventListener("lostpointercapture", end);
    thumb.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      if (isControlDisabled()) return;
      event.preventDefault();
      completeFromKeyboard();
    });
    thumb.addEventListener("click", (event) => {
      if (event.detail !== 0 || isControlDisabled()) return;
      event.preventDefault();
      completeFromKeyboard();
    });
    const completeFromKeyboard = () => {
      const controlBox = control.getBoundingClientRect();
      const thumbBox = thumb.getBoundingClientRect();
      maxDistance = axis === "x"
        ? Math.max(0, controlBox.width - thumbBox.width - 12)
        : Math.max(0, controlBox.height - thumbBox.height - 12);
      complete();
    };
    return reset;
  }

  pulseConnectionHaptic() {
    if (performance.now() - (this.lastConnectHapticAt || 0) < 2400) return false;
    return this.pulseConnectGestureHaptic();
  }

  pulseDisconnectHaptic() {
    return this.pulseHaptic(120);
  }

  pulseConnectGestureHaptic() {
    this.lastConnectHapticAt = performance.now();
    return this.pulseHaptic(120);
  }

  pulseHaptic(duration) {
    if (typeof navigator.vibrate !== "function") return false;
    return navigator.vibrate(duration);
  }

  handleLocalAction(action) {
    const actions = {
      settings: () => this.openSettings(),
      "close-settings": () => this.closeSettings(),
      "open-information": () => this.openInformation(),
      "back-to-settings": () => this.backToSettings(),
      "close-information": () => this.closeInformation(),
      "close-connection-method": () => this.closeConnectionMethodSheet(),
      "close-qr-sheet": () => this.closeQrChoiceSheet(),
      "close-action-sheet": () => this.closeActionSheets(),
      "close-all-sheets": () => this.closeAllSheets()
    };
    const handler = actions[action];
    if (!handler) return false;
    handler();
    return true;
  }

  render(state) {
    this.currentState = state;
    this.nodes.app.dataset.mode = state.mode;
    this.nodes.app.dataset.theme = state.theme || "light";
    this.nodes.app.dataset.locale = state.locale || "en";
    this.nodes.app.dataset.motion = state.motionPaused ? "paused" : "on";
    this.nodes.app.dataset.transferState = state.transfer ? "transferring" : "idle";
    this.nodes.app.style.setProperty("--self-ring", state.self.ringColor || "#ffffff");
    this.document.documentElement.lang = state.locale || "en";
    this.syncThemeColor(state.theme || "light");
    this.renderLocale(state);
    if (state.mode === "connected" || state.mode === "disconnecting") {
      renderStaticAvatar(this.nodes.selfAvatarImage, state.self.avatar);
    } else {
      renderAnimatedAvatar(this.nodes.selfAvatarImage, state.self.avatar, 0);
    }
    this.nodes.nameInput.value = state.self.name;
    this.renderCurrentDevice(state);
    const connectedPeer = state.peers.find((peer) => peer.id === state.connectedPeerId);
    this.nodes.connectionLabel.textContent = connectedPeer
      ? this.translate("connectedWith", { name: connectedPeer.name })
      : state.signalingStatus === "offline"
        ? this.translate("signalingUnavailableShort")
        : state.signalingStatus === "connecting"
          ? this.translate("signalingConnecting")
          : this.translate("lookingNearby");
    this.renderAvatarSettings(state);
    this.renderCapabilities(state.capabilities);
    this.renderPeers(state);
    this.renderConnectControl(state);
    this.renderTray(state);
    this.renderFiles(state);
    this.renderReceiveBadge(state);
    this.dynamicIsland.sync(state);
  }

  syncThemeColor(theme) {
    const islandState = this.document.querySelector("[data-dynamic-island]")?.dataset.state;
    const islandExpanded = islandState && !["closed", "closing"].includes(islandState);
    const themeColor = islandExpanded ? "#000000" : theme === "dark" ? "#171818" : "#f3f3f1";
    const meta = this.document.querySelector('meta[name="theme-color"]');
    if (meta && meta.getAttribute("content") !== themeColor) {
      meta.setAttribute("content", themeColor);
    }
  }

  showIslandQrDisplay(payload) {
    this.dynamicIsland.showQrDisplay(payload);
  }

  showIslandConnectionProgress(payload) {
    this.dynamicIsland.showConnectionProgress(payload.self, payload.peer, payload.ceremony);
  }

  showIslandAnonymousConnectionProgress(payload) {
    this.dynamicIsland.showAnonymousConnectionProgress(payload.self);
  }

  showIslandQrPreparing(payload) {
    this.dynamicIsland.showQrPreparing(payload);
  }

  updateIslandCeremony(payload) {
    this.dynamicIsland.updateCeremony(payload);
  }

  showIslandVerificationFailure(payload) {
    return this.dynamicIsland.showVerificationFailure(payload);
  }

  finishIslandConnectionTransition() {
    return this.dynamicIsland.finishConnectionTransition();
  }

  showIslandQrScanner(payload) {
    this.dynamicIsland.showQrScanner(payload);
  }

  prepareIslandQrScannerCamera() {
    return this.dynamicIsland.prepareCameraFromGesture();
  }

  markIslandQrSuccess() {
    this.dynamicIsland.markSuccess();
  }

  retryIslandQrScanner() {
    this.dynamicIsland.retryScanner();
  }

  closeDynamicIsland() {
    return this.dynamicIsland.close();
  }

  openConnectionMethodSheet(peer) {
    if (!this.nodes.connectionMethodSheet) return;
    if (this.nodes.connectionMethodPeer) {
      this.nodes.connectionMethodPeer.textContent = this.translate("connectionMethodPeer", { name: peer.name });
    }
    this.showSheet(this.nodes.connectionMethodSheet);
  }

  closeConnectionMethodSheet() {
    if (!this.nodes.connectionMethodSheet) return Promise.resolve();
    return this.hideSheet(this.nodes.connectionMethodSheet);
  }

  openQrChoiceSheet(peer, { incoming = false, suggestedRole = "show" } = {}) {
    if (!this.nodes.qrSheet) return;
    this.nodes.qrSheet.dataset.incoming = String(incoming);
    this.nodes.qrSheet.dataset.suggestedRole = suggestedRole;
    if (this.nodes.qrSheetPeer) {
      this.nodes.qrSheetPeer.textContent = this.translate("qrChoicePeer", { name: peer.name });
    }
    if (this.nodes.qrSheetCopy) {
      this.nodes.qrSheetCopy.textContent = this.translate(
        incoming ? "qrChoiceIncomingCopy" : "qrChoiceCopy",
        { name: peer.name }
      );
    }
    this.showSheet(this.nodes.qrSheet);
  }

  closeQrChoiceSheet() {
    if (!this.nodes.qrSheet) return Promise.resolve();
    return this.hideSheet(this.nodes.qrSheet);
  }

  toggleQrScannerPreview() {
    if (this.qrPreviewActive) {
      this.closeQrScannerPreview();
      return;
    }
    const state = this.currentState;
    if (!state) return;
    const peer = state.peers[0] || {
      name: this.translate("qrPreviewPeer"),
      avatar: state.self.avatar
    };
    this.qrPreviewActive = true;
    this.nodes.qrPreviewToggle?.setAttribute("aria-checked", "true");
    this.hideSheet(
      this.nodes.informationSheet,
      () => this.dynamicIsland.showQrScanner({ self: state.self, peer })
    );
  }

  async closeQrScannerPreview() {
    if (!this.qrPreviewActive) return;
    await this.dynamicIsland.close();
    this.qrPreviewActive = false;
    this.nodes.qrPreviewToggle?.setAttribute("aria-checked", "false");
    this.showSheet(this.nodes.informationSheet);
  }

  renderLocale(state) {
    this.document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = this.translate(node.dataset.i18n);
    });
    this.document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      node.setAttribute("aria-label", this.translate(node.dataset.i18nAria));
    });
    this.document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.setAttribute("placeholder", this.translate(node.dataset.i18nPlaceholder));
    });
    this.nodes.languageChoice.querySelectorAll("[data-locale]").forEach((button) => {
      const selected = button.dataset.locale === state.locale;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    this.nodes.motionChoice.querySelectorAll("[data-motion-value]").forEach((button) => {
      const selected = (button.dataset.motionValue === "paused") === state.motionPaused;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  renderCapabilities(capabilities) {
    const map = {
      mic: capabilities.microphone,
      ws: capabilities.websocket,
      tilt: capabilities.motion,
      bump: capabilities.bump,
      ultra: capabilities.ultra
    };
    Object.entries(map).forEach(([key, value]) => {
      const node = this.document.querySelector(`[data-capability="${key}"]`);
      if (!node) return;
      node.classList.toggle("is-on", Boolean(value));
      node.classList.toggle("is-warn", value === false && key !== "ws");
    });
  }

  renderPeers(state) {
    const rankedPeers = rankPeersForDisplay(state.peers, state);
    const orbitPeers = (state.connectedPeerId
      ? rankedPeers.filter((peer) => peer.id !== state.connectedPeerId).slice(0, CONNECTED_ORBIT_PEER_LIMIT)
      : rankedPeers.slice(0, ORBIT_PEER_LIMIT));
    const signature = [
      state.connectedPeerId || "",
      state.mode,
      state.locale || "en",
      state.motionPaused ? "paused" : "on",
      rankedPeers.length,
      ...orbitPeers.map((peer, index) => {
        const stage = normalizedPeerStage(peer, state);
        const layout = state.connectedPeerId
          ? CONNECTED_LAYOUT[index % CONNECTED_LAYOUT.length]
          : peerOrbitLayout(index);
        return `${peer.id}:${peer.name}:${peerDisplayAvatar(peer, index)}:${stage}:${layout.ringIndex}:${layout.angle}`;
      })
    ].join("|");
    if (signature === this.peerRenderSignature) return;
    this.peerRenderSignature = signature;
    this.nodes.peerOrbits.innerHTML = orbitPeers.map((peer, index) => {
      const stage = normalizedPeerStage(peer, state);
      const layout = state.connectedPeerId
        ? CONNECTED_LAYOUT[index % CONNECTED_LAYOUT.length]
        : peerOrbitLayout(index);
      const radius = state.connectedPeerId
        ? CONNECTED_ORBIT_RADII[layout.ringIndex]
        : `calc(var(--orbit-size) * ${ORBIT_RADII[layout.ringIndex]})`;
      const duration = state.connectedPeerId ? 76 : 72;
      const peerName = escapeHtml(String(peer.name || ""));
      const peerLabel = escapeHtml(this.translate("openPeer", { name: peer.name || "" }));
      const avatar = peerDisplayAvatar(peer, index);
      return `
        <div
          class="peer-node"
          data-stage="${stage}"
          data-ring-index="${layout.ringIndex}"
          style="--angle:${layout.angle}deg;--radius:${radius};--orbit-duration:${duration}s"
        >
          <div class="peer-avatar" aria-label="${peerLabel}">
            ${staticAvatarMarkup(avatar)}
          </div>
          <span>${peerName}</span>
        </div>
      `;
    }).join("");
  }

  renderConnectControl(state) {
    if (!this.nodes.connectNearby) return;
    const incoming = state.incomingInvite?.method !== "qr"
      ? state.incomingInvite
      : null;
    const incomingPeer = incoming ? state.peers.find((peer) => peer.id === incoming.peerId) : null;
    const connected = state.mode === "connected" || state.mode === "disconnecting";
    const verifying = state.mode === "verifying";
    const hasCandidate = Boolean(incomingPeer || state.peers.some((peer) => peer.online !== false && !peer.connected));
    const labelKey = verifying
      ? "verifying"
      : incomingPeer
        ? "joinNearbyConnection"
        : "connectNearby";
    const label = this.translate(labelKey, { name: incomingPeer?.name || "" });
    this.nodes.connectNearby.hidden = connected;
    this.nodes.connectNearby.disabled = verifying || state.signalingStatus === "offline" || !hasCandidate;
    this.nodes.connectNearby.textContent = label;
    this.nodes.connectNearby.setAttribute("aria-label", label);
  }

  renderAvatarOptions() {
    this.nodes.avatarCarousel.innerHTML = AVATAR_OPTIONS.map((avatar, index) => `
      <button
        type="button"
        data-action="select-avatar"
        data-avatar="${avatar}"
        aria-label="Choose profile icon ${index + 1}"
      >
        ${animatedAvatarMarkup(avatar, index)}
      </button>
    `).join("");
  }

  ensureAvatarOptions() {
    if (this.avatarOptionsRendered) return;
    this.renderAvatarOptions();
    this.avatarOptionsRendered = true;
    if (this.currentState) this.renderAvatarSettings(this.currentState);
  }

  renderAvatarSettings(state) {
    this.nodes.avatarCarousel.querySelectorAll("[data-avatar]").forEach((button) => {
      const optionNumber = Number(button.dataset.avatar.match(/(\d+)\.png$/)?.[1] || 1);
      button.setAttribute("aria-label", this.translate("chooseProfileIcon", { number: optionNumber }));
      const selected = button.dataset.avatar === state.self.avatar;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    this.nodes.ringChoice.querySelectorAll("[data-ring]").forEach((button) => {
      const selected = button.dataset.ring.toLowerCase() === state.self.ringColor.toLowerCase();
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  renderTray(state) {
    const connected = state.mode === "connected" || state.mode === "disconnecting";
    this.nodes.tray.hidden = !connected;
    this.nodes.connectedPeer.hidden = !connected;
    if (connected) {
      const peer = state.peers.find((item) => item.id === state.connectedPeerId);
      this.nodes.connectedPeer.innerHTML = peer ? staticAvatarMarkup(peerDisplayAvatar(peer, 0)) : "";
      const firstName = peer?.name.split(" ")[0] || "peer";
      this.nodes.sendTitle.textContent = this.translate("sendTo", { name: firstName });
      this.nodes.sendCopy.textContent = this.translate("sendCopy");
      this.nodes.chatTitle.textContent = this.translate("chatWith", { name: firstName });
    } else {
      this.nodes.sendTitle.textContent = this.translate("selectFiles");
      this.nodes.sendCopy.textContent = this.translate("sendCopy");
      this.nodes.chatTitle.textContent = this.translate("messagePeer");
    }
  }

  renderFiles(state) {
    this.nodes.selectedFiles.hidden = state.files.length === 0;
    if (this.nodes.sendSwipeControl) {
      this.setSendSwipeReady(state.files.length > 0);
    }
    this.nodes.selectedFiles.innerHTML = state.files.map((file) => `
      <div class="selected-file">
        <span class="selected-file-icon">${fileIcon(file)}</span>
        <div>
          <strong>${escapeHtml(file.name)}</strong>
          <span>${formatBytes(file.size)}</span>
        </div>
        <span>${fileType(file, this.translate.bind(this))}</span>
      </div>
    `).join("");
  }

  renderReceiveBadge(state) {
    const visibleCount = visibleReceivedItems(state).length;
    this.nodes.receiveBadge.hidden = visibleCount <= 0;
    this.nodes.receiveBadge.textContent = String(visibleCount);
    this.renderChatBadge(state);
    this.renderReceivedList(state);
    this.renderChat(state);
  }

  renderChatBadge(state) {
    if (!this.nodes.chatBadge) return;
    const count = Math.max(0, Number(state.unreadChatCount || 0));
    this.nodes.chatBadge.hidden = count <= 0;
    this.nodes.chatBadge.textContent = count > 99 ? "99+" : String(count);
  }

  renderReceivedList(state) {
    if (!this.nodes.receivedList) return;
    const receivedItems = visibleReceivedItems(state);
    const signature = [
      state.locale || "en",
      ...receivedItems.map((item) => [
        item.id,
        item.transferId,
        item.name,
        item.size,
        item.status,
        item.url ? "url" : "",
        item.canSave ? "save" : ""
      ].join(":"))
    ].join("|");
    if (signature === this.receivedRenderSignature) return;
    this.receivedRenderSignature = signature;
    if (!receivedItems.length) {
      this.nodes.receivedList.innerHTML = `
        <div class="empty-receive">
          <span class="received-file-icon">↓</span>
          <div>
            <strong>${this.translate("noReceived")}</strong>
            <span>${this.translate("noReceivedCopy")}</span>
          </div>
        </div>
      `;
      return;
    }
    this.nodes.receivedList.innerHTML = receivedItems.map((item) => `
      <div class="received-file">
        <span class="received-file-icon">${escapeHtml(item.icon || "↓")}</span>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(receivedFileStatus(this, item))}</span>
        </div>
        ${receivedActionMarkup(this, item)}
      </div>
    `).join("");
  }

  renderCurrentDevice(state) {
    if (!this.nodes.currentDevice) return;
    const family = selfDeviceFamily(state);
    const label = familyLabel(family);
    this.nodes.currentDevice.innerHTML = `
      <span class="device-summary-line">
        ${deviceBrandMarkup({ deviceFamily: family, deviceLabel: label })}
        <span>${escapeHtml(label)}</span>
      </span>
    `;
  }

  renderChat(state) {
    if (!this.nodes.chatPanel) return;
    const signature = [
      state.locale || "en",
      ...state.chatMessages.map((message) => {
        const normalized = typeof message === "string"
          ? { author: "self", text: message }
          : message;
        return `${normalized.author || ""}:${normalized.text || ""}:${normalized.receivedAt || ""}`;
      })
    ].join("|");
    if (signature === this.chatRenderSignature) return;
    const shouldScroll = this.isChatSheetOpen() && state.chatMessages.length > this.lastChatMessageCount;
    this.chatRenderSignature = signature;
    this.lastChatMessageCount = state.chatMessages.length;
    if (!state.chatMessages.length) {
      this.nodes.chatPanel.innerHTML = `<div class="chat-empty">${this.translate("noMessages")}</div>`;
      return;
    }
    this.nodes.chatPanel.innerHTML = `
      <div class="chat-thread">
        ${state.chatMessages.map((message) => {
          const normalized = typeof message === "string"
            ? { author: "self", text: message }
            : message;
          const mine = normalized.author === "self";
          return `
            <div class="chat-row ${mine ? "is-mine" : "is-theirs"}">
              <div class="chat-bubble">${escapeHtml(normalized.text || "")}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
    if (shouldScroll) {
      requestAnimationFrame(() =>
        this.nodes.chatPanel.scrollTo({
          top: this.nodes.chatPanel.scrollHeight,
          behavior: "smooth"
        })
      );
    }
  }

  openPeerSheet(peer, { peers, direction = "outgoing", method = "proximity" } = {}) {
    const incoming = direction === "incoming";
    const qr = method === "qr";
    this.nodes.peerSheet.dataset.inviteDirection = incoming ? "incoming" : "outgoing";
    this.nodes.peerSheet.dataset.connectionMethod = qr ? "qr" : "proximity";
    this.nodes.peerSheet.setAttribute(
      "aria-label",
      this.translate(incoming ? "incomingPeerActions" : "peerActions")
    );
    this.nodes.peerSheet.querySelector(".sheet-kicker").textContent = this.translate(
      qr ? "manualQrKicker" : incoming ? "incomingInviteKicker" : "nearbyCandidate"
    );
    this.nodes.sheetPeerName.innerHTML = `${deviceBrandMarkup(peer)}<span>${escapeHtml(peer.name)}</span>`;
    renderAnimatedAvatar(this.nodes.sheetPeerAvatar, peerDisplayAvatar(peer, 0), 1);
    this.nodes.sheetCopy.textContent = this.translate(
      qr
        ? incoming ? "incomingQrInviteCopy" : "outgoingQrCopy"
        : incoming ? "incomingInviteCopy" : "peerSheetReadyCopy",
      { name: peer.name }
    );
    const stripAvatars = previewAvatarStrip(peer, peers);
    this.nodes.friendStrip.innerHTML = stripAvatars.map((avatar, index) =>
      animatedAvatarMarkup(avatar, index)
    ).join("") + "<span>+</span>";
    if (this.nodes.connectButton) {
      const labelKey = qr
        ? incoming ? "scanQr" : "showQr"
        : incoming ? "acceptConnection" : "startProximity";
      this.nodes.connectButton.textContent = this.translate(labelKey);
      this.nodes.connectButton.setAttribute("aria-label", this.translate(labelKey));
    }
    if (this.nodes.peerSheetCancel) {
      this.nodes.peerSheetCancel.textContent = this.translate(incoming ? "decline" : "cancel");
    }
    this.showSheet(this.nodes.peerSheet);
  }

  closePeerSheet() {
    return this.hideSheet(this.nodes.peerSheet, () => {
      this.nodes.peerSheet.dataset.inviteDirection = "outgoing";
      this.nodes.peerSheet.dataset.connectionMethod = "proximity";
      this.nodes.peerSheet.setAttribute("aria-label", this.translate("peerActions"));
      this.nodes.peerSheet.querySelector(".sheet-kicker").textContent = this.translate("nearbyCandidate");
      if (this.nodes.peerSheetCancel) this.nodes.peerSheetCancel.textContent = this.translate("cancel");
      if (this.nodes.connectButton) {
        this.nodes.connectButton.textContent = this.translate("startProximity");
        this.nodes.connectButton.setAttribute("aria-label", this.translate("startProximity"));
      }
    });
  }

  isChatSheetOpen() {
    return Boolean(this.nodes.chatSheet && !this.nodes.chatSheet.hidden);
  }

  openSettings() {
    this.ensureAvatarOptions();
    this.showSheet(this.nodes.settingsSheet);
  }

  closeSettings() {
    this.hideSheet(this.nodes.settingsSheet);
  }

  openInformation() {
    this.hideSheet(
      this.nodes.settingsSheet,
      () => this.showSheet(this.nodes.informationSheet),
      { keepBackdrop: true }
    );
  }

  backToSettings() {
    this.ensureAvatarOptions();
    this.hideSheet(
      this.nodes.informationSheet,
      () => this.showSheet(this.nodes.settingsSheet),
      { keepBackdrop: true }
    );
  }

  closeInformation() {
    this.hideSheet(this.nodes.informationSheet);
  }

  openSendSheet() {
    this.resetSendSwipe?.();
    const hasFiles = (this.currentState?.files.length || 0) > 0;
    this.setSendSwipeReady(hasFiles);
    this.showSheet(this.nodes.sendSheet);
  }

  openReceiveSheet() {
    this.showSheet(this.nodes.receiveSheet);
  }

  openChatSheet() {
    this.showSheet(this.nodes.chatSheet, () => this.nodes.chatInput.focus());
  }

  closeActionSheets() {
    [this.nodes.sendSheet, this.nodes.receiveSheet, this.nodes.chatSheet].forEach((sheet) => {
      this.hideSheet(sheet);
    });
  }

  closeAllSheets() {
    [
      this.nodes.peerSheet,
      this.nodes.connectionMethodSheet,
      this.nodes.qrSheet,
      this.nodes.settingsSheet,
      this.nodes.informationSheet,
      this.nodes.sendSheet,
      this.nodes.receiveSheet,
      this.nodes.chatSheet
    ].forEach((sheet) => this.hideSheet(sheet));
  }

  showSheet(sheet, onShown) {
    const existingTimer = this.sheetHideTimers.get(sheet);
    if (existingTimer) clearTimeout(existingTimer);
    if (!this.visibleSheet() && !this.lastFocusedBeforeSheet) {
      this.lastFocusedBeforeSheet = this.document.activeElement;
    }
    sheet.hidden = false;
    sheet.classList.remove("is-closing");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sheet.style.opacity = "0";
    sheet.style.transform = reduced ? "none" : "translateY(calc(100% + 24px)) scale(.985)";
    void sheet.offsetHeight;
    this.nodes.app.dataset.sheetOpen = "true";
    this.setSheetBackgroundInert(true);
    this.showBackdrop();
    this.focusSheet(sheet);
    sheet.classList.add("is-open");
    sheet.style.opacity = "1";
    sheet.style.transform = reduced ? "none" : "translateY(0) scale(1)";
    this.afterTransition(sheet, () => {
      this.settleSheetState(sheet, true);
      this.focusSheet(sheet);
      onShown?.();
    });
  }

  hideSheet(sheet, onHidden, { keepBackdrop = false } = {}) {
    return new Promise((resolve) => {
      if (sheet.hidden) {
        onHidden?.();
        resolve();
        return;
      }
      const existingTimer = this.sheetHideTimers.get(sheet);
      if (existingTimer) clearTimeout(existingTimer);
      sheet.classList.remove("is-open");
      sheet.classList.add("is-closing");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sheet.style.opacity = "0";
      sheet.style.transform = reduced ? "none" : "translateY(calc(100% + 24px)) scale(.985)";
      if (!keepBackdrop) this.hideBackdropIfIdle();
      const finish = () => {
        this.settleSheetState(sheet, false);
        sheet.hidden = true;
        sheet.classList.remove("is-closing");
        this.sheetHideTimers.delete(sheet);
        const anyVisible = [
          this.nodes.peerSheet,
          this.nodes.connectionMethodSheet,
          this.nodes.qrSheet,
          this.nodes.settingsSheet,
          this.nodes.informationSheet,
          this.nodes.sendSheet,
          this.nodes.receiveSheet,
          this.nodes.chatSheet
        ].some((node) => !node.hidden);
        this.nodes.app.dataset.sheetOpen = String(anyVisible);
        const restoreTarget = this.lastFocusedBeforeSheet;
        const shouldRestoreBackground = !keepBackdrop && !this.visibleSheet();
        if (shouldRestoreBackground) this.setSheetBackgroundInert(false);
        onHidden?.();
        if (shouldRestoreBackground) {
          this.lastFocusedBeforeSheet = null;
          const active = this.document.activeElement;
          if (active === this.document.body || sheet.contains(active)) {
            restoreTarget?.focus?.({ preventScroll: true });
          }
        }
        resolve();
      };
      this.afterTransition(sheet, finish, true);
    });
  }

  showBackdrop() {
    clearTimeout(this.backdropTimer);
    this.nodes.backdrop.hidden = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.nodes.backdrop.classList.add("is-open"));
    });
  }

  hideBackdropIfIdle() {
    const hasOpenSheet = [
      this.nodes.peerSheet,
      this.nodes.settingsSheet,
      this.nodes.informationSheet,
      this.nodes.sendSheet,
      this.nodes.receiveSheet,
      this.nodes.chatSheet
    ].some((node) => node.classList.contains("is-open"));
    if (hasOpenSheet) return;
    this.nodes.backdrop.classList.remove("is-open");
    clearTimeout(this.backdropTimer);
    this.afterTransition(this.nodes.backdrop, () => {
      this.nodes.backdrop.hidden = true;
    }, true);
  }

  afterTransition(node, callback, closing = false) {
    let settled = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const expectedProperty = node === this.nodes.backdrop || reduced ? "opacity" : "transform";
    const finish = () => {
      if (settled) return;
      settled = true;
      node.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      callback();
    };
    const onEnd = (event) => {
      if (event.target === node && event.propertyName === expectedProperty) finish();
    };
    node.addEventListener("transitionend", onEnd);
    const timer = window.setTimeout(finish, closing ? 420 : 480);
  }

  settleSheetState(sheet, open) {
    const previousTransition = sheet.style.transition;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sheet.style.transition = "none";
    sheet.style.opacity = open ? "1" : "0";
    sheet.style.transform = open || reduced ? "translateY(0) scale(1)" : "translateY(calc(100% + 24px)) scale(.985)";
    void sheet.offsetHeight;
    sheet.style.transition = previousTransition;
  }

  visibleSheet() {
    return [
      this.nodes.peerSheet,
      this.nodes.connectionMethodSheet,
      this.nodes.qrSheet,
      this.nodes.settingsSheet,
      this.nodes.informationSheet,
      this.nodes.sendSheet,
      this.nodes.receiveSheet,
      this.nodes.chatSheet
    ].find((sheet) => !sheet.hidden && !sheet.classList.contains("is-closing")) || null;
  }

  focusableElements(sheet) {
    return [...sheet.querySelectorAll(
      "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )].filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true");
  }

  focusSheet(sheet) {
    const target = this.focusableElements(sheet)[0] || sheet;
    target.focus({ preventScroll: true });
  }

  trapSheetFocus(event, sheet) {
    const focusable = this.focusableElements(sheet);
    if (!focusable.length) {
      event.preventDefault();
      sheet.focus({ preventScroll: true });
      return;
    }
    const active = this.document.activeElement;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!sheet.contains(active)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  setSheetBackgroundInert(active) {
    for (const node of this.sheetBackgroundNodes) {
      node.inert = active;
      node.setAttribute("aria-hidden", String(active));
    }
  }

  setSendSwipeReady(ready) {
    this.nodes.sendSwipeControl?.classList.toggle("is-ready", ready);
    this.nodes.sendSwipeControl?.setAttribute("aria-disabled", String(!ready));
    if (this.nodes.sendSwipeThumb) {
      this.nodes.sendSwipeThumb.disabled = !ready;
      this.nodes.sendSwipeThumb.tabIndex = ready ? 0 : -1;
    }
    if (!ready) this.resetSendSwipe?.();
    if (this.nodes.sendSwipeText) {
      this.nodes.sendSwipeText.textContent = this.translate(ready ? "swipeSend" : "chooseFirst");
    }
  }

  openFilePicker() {
    this.nodes.fileInput.click();
  }

  toast(message) {
    this.nodes.toast.textContent = message;
    this.nodes.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.nodes.toast.hidden = true;
    }, 2800);
  }

  takeChatMessage() {
    const value = this.nodes.chatInput.value.trim();
    this.nodes.chatInput.value = "";
    return value;
  }

  translate(key, params) {
    return translate(this.store.getState().locale || "en", key, params);
  }

  transitionUpdate(callback) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && this.document.startViewTransition) {
      this.document.startViewTransition(callback);
      return;
    }
    callback();
  }
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function fileIcon(file) {
  if (file.type.startsWith("image/")) return "◎";
  if (file.type.startsWith("video/")) return "▣";
  if (file.type.includes("pdf")) return "P";
  return "⌁";
}

function fileType(file, t) {
  if (file.type.startsWith("image/")) return t("photo");
  if (file.type.startsWith("video/")) return t("video");
  if (file.type.includes("pdf")) return t("pdf");
  return t("file");
}

function receivedActionMarkup(view, item) {
  if (!item.url && !item.canSave) {
    return `<button type="button" class="received-file-state" disabled>${view.translate(item.status === "retry" ? "needsRetry" : "saved")}</button>`;
  }
  const transferId = escapeHtml(item.transferId || "");
  const fileId = escapeHtml(item.id || "");
  const actions = isPreviewableReceivedItem(item) ? ["view", "download"] : ["download"];
  return `
    <span class="received-file-actions">
      ${actions.map((intent) => `
        <button type="button" data-action="open-received" data-received-intent="${intent}" data-transfer-id="${transferId}" data-file-id="${fileId}">${view.translate(intent)}</button>
      `).join("")}
    </span>
  `;
}

function isPreviewableReceivedItem(item = {}) {
  const type = String(item.type || "").toLowerCase();
  const name = String(item.name || item.downloadName || "").toLowerCase();
  if (type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf") return true;
  return /\.(png|jpe?g|gif|webp|avif|pdf|mp4|mov|webm)$/i.test(name);
}

function normalizedPeerStage(peer, state) {
  if (state.connectedPeerId === peer.id) return "near";
  if (state.mode === "connected") return "lobby";
  if (state.selectedPeerId === peer.id && state.mode === "verifying") return "verify";
  if (state.pendingInviteId === peer.id || peer.stage === "intent") return "intent";
  return ["lobby", "near", "intent", "verify"].includes(peer.stage) ? peer.stage : "lobby";
}

function peerOrbitLayout(index) {
  const slot = ORBIT_LAYOUT_SLOTS[index % ORBIT_LAYOUT_SLOTS.length];
  const lap = Math.floor(index / ORBIT_LAYOUT_SLOTS.length);
  return {
    ringIndex: slot.ringIndex,
    angle: slot.angle + lap * 17
  };
}

function rankPeersForDisplay(peers, state) {
  return [...peers]
    .map((peer) => ({
      ...peer,
      __rankScore: peerRankScore(peer, state)
    }))
    .sort((a, b) =>
      b.__rankScore - a.__rankScore
        || String(a.name || "").localeCompare(String(b.name || ""))
        || String(a.id || "").localeCompare(String(b.id || ""))
    );
}

function peerRankScore(peer, state) {
  const explicit = Number(peer.proximityScore ?? peer.proximity?.score);
  const base = Number.isFinite(explicit) ? explicit : 48;
  const stageBonus = {
    verify: 24,
    near: 20,
    intent: 12,
    lobby: 0
  }[normalizedPeerStage(peer, state)] || 0;
  const distanceBonus = {
    immediate: 28,
    near: 20,
    room: 12,
    building: 4,
    far: 0
  }[peer.distanceBucket || peer.proximity?.bucket] || 0;
  const recentBonus = peerPreviouslyConnected(peer) ? 9 : 0;
  const sameDeviceBonus = selfDeviceFamily(state) === peerDeviceFamily(peer) ? 4 : 0;
  return Math.max(0, Math.min(100, base + stageBonus + distanceBonus + recentBonus + sameDeviceBonus));
}

function matchesNearbyFilter(peer, state, filter) {
  if (filter === "recent") return peerPreviouslyConnected(peer);
  if (filter === "same-device") return selfDeviceFamily(state) === peerDeviceFamily(peer);
  return true;
}

function peerPreviouslyConnected(peer) {
  return Boolean(peer.connectedBefore || peer.lastConnectedAt || Number(peer.previousConnections || 0) > 0);
}

function peerDeviceFamily(peer) {
  return peer.deviceFamily || peer.capabilities?.platform?.family || peer.platform || "unknown";
}

function selfDeviceFamily(state) {
  return state.self.deviceFamily || state.capabilities?.platform?.family || "unknown";
}

function peerDeviceLabel(peer) {
  return peer.deviceLabel || peer.deviceType || peer.capabilities?.platform?.label || familyLabel(peerDeviceFamily(peer));
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

function peerDistanceKey(peer) {
  return {
    immediate: "distanceImmediate",
    near: "distanceNear",
    room: "distanceRoom",
    building: "distanceBuilding",
    far: "distanceFar"
  }[peer.distanceBucket || peer.proximity?.bucket] || "distanceNear";
}

function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function visibleReceivedItems(state) {
  const items = state.receivedItems.filter((item) => !item.locale || item.locale === state.locale);
  const activeReceive = activeReceiveItem(state);
  return activeReceive ? [activeReceive, ...items] : items;
}

function activeReceiveItem(state) {
  const transfer = state?.transfer;
  if (!transfer || transfer.direction !== "receive") return null;
  const size = Number.isFinite(transfer.totalBytes) ? formatBytes(transfer.totalBytes) : "";
  return {
    id: transfer.fileId || transfer.transferId || "active-receive",
    transferId: transfer.transferId || "active-receive",
    name: transfer.name || "Incoming file",
    size,
    icon: "↓",
    status: "receiving",
    canOpen: false
  };
}

function receivedFileStatus(view, item) {
  const size = item.size || "";
  if (item.status === "saved") return `${size} · ${view.translate("savedToDownloads")}`;
  if (item.status === "retry") return `${size} · ${view.translate("needsRetry")}`;
  if (item.status === "receiving") return `${size} · ${view.translate("receivingStatus")}`;
  return size;
}

function animatedAvatarMarkup(avatar, stagger = 0) {
  const normalizedAvatar = normalizeAvatarChoice(avatar);
  const frames = animatedFramesForAvatar(normalizedAvatar);
  if (!frames.length) {
    return `<img src="${escapeHtml(normalizedAvatar)}" alt="">`;
  }
  return `
    <span class="avatar-animation" style="--avatar-stagger:${stagger * -0.34}s" aria-hidden="true">
      ${frames.map((frame, index) => `
        <img
          class="avatar-frame"
          src="${escapeHtml(frame)}"
          alt=""
          style="--avatar-frame-delay:${avatarFrameDelay(index)}"
        >
      `).join("")}
    </span>
  `;
}

function peerDisplayAvatar(peer, index = 0) {
  const rawAvatar = peer?.avatar || peer?.avatarId;
  if (rawAvatar) return normalizeAvatarChoice(rawAvatar);
  const hash = stableHash(`${peer?.id || ""}:${peer?.name || ""}:${index}`);
  return AVATAR_OPTIONS[hash % AVATAR_OPTIONS.length];
}

function previewAvatarStrip(peer, peers = []) {
  const seen = new Set();
  const avatars = [];
  const push = (avatar) => {
    const normalized = normalizeAvatarChoice(avatar);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    avatars.push(normalized);
  };
  push(peerDisplayAvatar(peer, 0));
  peers.forEach((item, index) => push(peerDisplayAvatar(item, index + 1)));
  AVATAR_OPTIONS.forEach(push);
  return avatars.slice(0, 5);
}

function stableHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function staticAvatarMarkup(avatar) {
  const normalizedAvatar = normalizeAvatarChoice(avatar);
  const frame = animatedFramesForAvatar(normalizedAvatar)[0] || normalizedAvatar;
  return `<img class="avatar-static" src="${escapeHtml(frame)}" alt="">`;
}

const DEVICE_ICON_MARKUP = Object.freeze({
  apple: '<path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zm3.378-3.066c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"></path>',
  samsung: '<text x="44" y="14" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="800" letter-spacing="1.25">SAMSUNG</text>',
  android: '<path d="M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z"></path>',
  google: '<path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"></path>',
  windows: '<path d="M4 5.12 10.75 4.2v6.42H4zm7.55-1.03L20 3v7.62h-8.45zM4 11.38h6.75v6.42L4 16.88zm7.55 0H20V21l-8.45-1.18z"></path>',
  device: '<rect x="7" y="3" width="10" height="18" rx="3"></rect><path d="M11 18h2"></path>'
});

function deviceBrandMarkup(peer) {
  const brand = deviceBrand(peer);
  const viewBox = brand === "samsung" ? "0 0 88 24" : "0 0 24 24";
  return `
    <span class="device-brand device-brand--${brand}${OFFICIAL_DEVICE_BRANDS.has(brand) ? " device-brand--official" : ""}" aria-hidden="true">
      <svg viewBox="${viewBox}" focusable="false">
        ${DEVICE_ICON_MARKUP[brand] || DEVICE_ICON_MARKUP.device}
      </svg>
    </span>
  `;
}

const OFFICIAL_DEVICE_BRANDS = new Set(["apple", "samsung", "google", "android", "windows"]);

function deviceBrand(peer) {
  const family = peerDeviceFamily(peer).toLowerCase();
  const label = `${peerDeviceLabel(peer)} ${peer?.name || ""}`.toLowerCase();
  if (label.includes("samsung") || label.includes("galaxy")) return "samsung";
  if (label.includes("pixel")) return "google";
  if (/(surface|windows|win32|win64)/.test(label) || family === "windows") return "windows";
  if (family === "android" || /(android|fold|galaxy tab)/.test(label)) return "android";
  if (family === "watchos" || label.includes("watch")) return "apple";
  if (family === "macos" || /mac/.test(label)) return "apple";
  if (family === "ipad" || /(ipad|apple tablet)/.test(label)) return "apple";
  if (family === "ios" || /(iphone|apple)/.test(label)) return "apple";
  if (/(tablet|tab|pad)/.test(label)) return "android";
  return "device";
}

function renderAnimatedAvatar(node, avatar, stagger = 0) {
  const normalizedAvatar = normalizeAvatarChoice(avatar);
  const avatarKey = `animated:${normalizedAvatar}`;
  if (node.dataset.avatarKey === avatarKey) return;
  const frames = animatedFramesForAvatar(normalizedAvatar);
  frames.forEach(preloadImage);
  if (!frames.length) {
    node.innerHTML = `<img src="${escapeHtml(normalizedAvatar)}" alt="">`;
    node.dataset.avatarKey = avatarKey;
    return;
  }
  node.innerHTML = frames.map((frame, index) => `
    <img
      class="avatar-frame"
      src="${escapeHtml(frame)}"
      alt=""
      style="--avatar-frame-delay:${avatarFrameDelay(index)};--avatar-stagger:${stagger * -0.34}s"
    >
  `).join("");
  node.dataset.avatarKey = avatarKey;
}

function renderStaticAvatar(node, avatar) {
  const normalizedAvatar = normalizeAvatarChoice(avatar);
  const avatarKey = `static:${normalizedAvatar}`;
  if (node.dataset.avatarKey === avatarKey) return;
  preloadImage(animatedFramesForAvatar(normalizedAvatar)[0] || normalizedAvatar);
  node.innerHTML = staticAvatarMarkup(normalizedAvatar);
  node.dataset.avatarKey = avatarKey;
}

function preloadImage(src) {
  if (!src) return;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  image.decode?.().catch(() => {});
}

function avatarFrameDelay(index) {
  if (index === 0) return "0s";
  return `${-(36 - index * 6)}s`;
}

export const __appViewTest = Object.freeze({
  escapeHtml,
  staticAvatarMarkup,
  isPreviewableReceivedItem
});

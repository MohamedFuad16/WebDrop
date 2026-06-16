import { Emitter } from "../utils/emitter.js";
import { formatBytes } from "../utils/format.js";
import { AVATAR_OPTIONS, animatedFramesForAvatar } from "../config/avatar-options.js";
import { translate } from "../config/i18n.js";
import { DynamicIsland } from "./dynamic-island.js";

const ORBIT_RADII = [".423", ".32", ".216"];
const CONNECTED_ORBIT_RADII = [
  "calc((var(--orbit-size) * .423))",
  "calc((var(--orbit-size) * .282) + (var(--connected-avatar) * .3447))",
  "calc((var(--orbit-size) * .141) + (var(--connected-avatar) * .6893))"
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
      tray: document.querySelector("[data-connection-tray]"),
      connectedPeer: document.querySelector("[data-connected-peer]"),
      disconnectHaptic: document.querySelector("[data-disconnect-haptic]"),
      peerSheet: document.querySelector("[data-peer-sheet]"),
      settingsSheet: document.querySelector("[data-settings-sheet]"),
      informationSheet: document.querySelector("[data-information-sheet]"),
      sendSheet: document.querySelector("[data-send-sheet]"),
      receiveSheet: document.querySelector("[data-receive-sheet]"),
      chatSheet: document.querySelector("[data-chat-sheet]"),
      backdrop: document.querySelector("[data-backdrop]"),
      sheetPeerName: document.querySelector("[data-sheet-peer-name]"),
      sheetPeerAvatar: document.querySelector("[data-sheet-peer-avatar]"),
      sheetCopy: document.querySelector("[data-sheet-copy]"),
      sendTitle: document.querySelector("[data-send-title]"),
      sendCopy: document.querySelector("[data-send-copy]"),
      chatTitle: document.querySelector("[data-chat-title]"),
      chatPanel: document.querySelector("[data-chat-panel]"),
      chatInput: document.querySelector("[data-chat-input]"),
      friendStrip: document.querySelector("[data-friend-strip]"),
      swipeControl: document.querySelector("[data-swipe-control]"),
      swipeThumb: document.querySelector("[data-swipe-thumb]"),
      swipeText: document.querySelector("[data-swipe-text]"),
      connectHaptic: document.querySelector("[data-connect-haptic]"),
      sendSwipeControl: document.querySelector("[data-send-swipe-control]"),
      sendSwipeThumb: document.querySelector("[data-send-swipe-thumb]"),
      sendSwipeText: document.querySelector("[data-send-swipe-text]"),
      sendConfirm: document.querySelector(".send-confirm"),
      nameInput: document.querySelector("[data-name-input]"),
      fileInput: document.querySelector("[data-file-input]"),
      selectedFiles: document.querySelector("[data-selected-files]"),
      receivedList: document.querySelector("[data-received-list]"),
      receiveBadge: document.querySelector("[data-receive-badge]"),
      qrPreviewToggle: document.querySelector("[data-qr-preview-toggle]"),
      toast: document.querySelector("[data-toast]")
    };
    this.sheetHideTimers = new WeakMap();
    this.backdropTimer = null;
    this.lastFocusedBeforeSheet = null;
    this.sheetBackgroundNodes = [
      document.querySelector(".topbar"),
      document.querySelector(".main-stage"),
      document.querySelector("[data-connection-tray]"),
      document.querySelector("[data-dynamic-island]")
    ].filter(Boolean);
    this.avatarOptionsRendered = false;
    this.peerRenderSignature = "";
    this.dynamicIsland = new DynamicIsland(document, (key, params) => this.translate(key, params));
    this.dynamicIsland.on("detected", (token) => this.emit("island-qr-detected", token));
    this.dynamicIsland.on("cancel", () => {
      if (this.qrPreviewActive) {
        this.closeQrScannerPreview();
        return;
      }
      this.emit("island-cancel");
    });
    this.dynamicIsland.on("fallback", () => this.emit("island-fallback"));
    this.bindEvents();
    this.bindSwipeControls();
    store.subscribe((state) => this.render(state));
  }

  bindEvents() {
    this.document.addEventListener("click", (event) => {
      const peerButton = event.target.closest("[data-peer-id]");
      if (peerButton) {
        this.emit("peer-select", peerButton.dataset.peerId);
        return;
      }
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
          fileId: actionTarget.dataset.fileId
        });
        return;
      }
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
    this.resetSwipe = this.bindSwipe({
      control: this.nodes.swipeControl,
      thumb: this.nodes.swipeThumb,
      text: this.nodes.swipeText,
      axis: "x",
      defaultText: "swipeConnect",
      completeText: "connecting",
      eventName: "swipe-connect",
      hapticSwitch: this.nodes.connectHaptic
    });
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
    const isControlDisabled = () => thumb.disabled || control.getAttribute("aria-disabled") === "true";
    const setX = (value) => {
      currentDistance = Math.max(0, Math.min(maxDistance, value));
      control.style.setProperty("--swipe-x", `${axis === "x" ? currentDistance : 0}px`);
      control.style.setProperty("--swipe-y", `${axis === "y" ? currentDistance * -1 : 0}px`);
    };
    const reset = () => {
      control.classList.remove("is-complete", "is-dragging");
      text.textContent = this.translate(defaultText);
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
      allowHapticToggle = true;
      control.classList.add("is-complete");
      text.textContent = this.translate(completeText);
      setX(maxDistance);
      if (eventName === "swipe-connect") this.pulseConnectGestureHaptic();
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
      const controlBox = control.getBoundingClientRect();
      const thumbBox = thumb.getBoundingClientRect();
      maxDistance = axis === "x"
        ? Math.max(0, controlBox.width - thumbBox.width - 12)
        : Math.max(0, controlBox.height - thumbBox.height - 12);
      complete();
    });
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

  render(state) {
    this.currentState = state;
    this.nodes.app.dataset.mode = state.mode;
    this.nodes.app.dataset.theme = state.theme || "light";
    this.nodes.app.dataset.locale = state.locale || "en";
    this.nodes.app.dataset.motion = state.motionPaused ? "paused" : "on";
    this.nodes.app.dataset.transferState = state.transfer ? "transferring" : "idle";
    this.nodes.app.style.setProperty("--self-ring", state.self.ringColor || "#ffffff");
    this.document.documentElement.lang = state.locale || "en";
    this.renderLocale(state);
    if (state.mode === "connected" || state.mode === "disconnecting") {
      renderStaticAvatar(this.nodes.selfAvatarImage, state.self.avatar);
    } else {
      renderAnimatedAvatar(this.nodes.selfAvatarImage, state.self.avatar, 0);
    }
    this.nodes.nameInput.value = state.self.name;
    const connectedPeer = state.peers.find((peer) => peer.id === state.connectedPeerId);
    this.nodes.connectionLabel.textContent = connectedPeer
      ? this.translate("connectedWith", { name: connectedPeer.name })
      : this.translate("lookingNearby");
    this.renderAvatarSettings(state);
    this.renderCapabilities(state.capabilities);
    this.renderPeers(state);
    this.renderTray(state);
    this.renderFiles(state);
    this.renderReceiveBadge(state);
    this.dynamicIsland.sync(state);
  }

  showIslandQrDisplay(payload) {
    this.dynamicIsland.showQrDisplay(payload);
  }

  showIslandConnectionProgress(payload) {
    this.dynamicIsland.showConnectionProgress(payload.self, payload.peer);
  }

  finishIslandConnectionTransition() {
    return this.dynamicIsland.finishConnectionTransition();
  }

  showIslandQrScanner(payload) {
    this.dynamicIsland.showQrScanner(payload);
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
    const orbitPeers = state.connectedPeerId
      ? state.peers.filter((peer) => peer.id !== state.connectedPeerId)
      : state.peers;
    const signature = [
      state.connectedPeerId || "",
      state.mode,
      state.locale || "en",
      state.motionPaused ? "paused" : "on",
      ...orbitPeers.map((peer, index) => {
        const stage = normalizedPeerStage(peer, state);
        const layout = state.connectedPeerId
          ? CONNECTED_LAYOUT[index % CONNECTED_LAYOUT.length]
          : peerOrbitLayout(peer, index);
        return `${peer.id}:${peer.name}:${peer.avatar}:${stage}:${layout.ringIndex}:${layout.angle}`;
      })
    ].join("|");
    if (signature === this.peerRenderSignature) return;
    this.peerRenderSignature = signature;
    this.nodes.peerOrbits.innerHTML = orbitPeers.map((peer, index) => {
      const stage = normalizedPeerStage(peer, state);
      const layout = state.connectedPeerId
        ? CONNECTED_LAYOUT[index % CONNECTED_LAYOUT.length]
        : peerOrbitLayout(peer, index);
      const radius = state.connectedPeerId
        ? CONNECTED_ORBIT_RADII[layout.ringIndex]
        : `calc(var(--orbit-size) * ${ORBIT_RADII[layout.ringIndex]})`;
      const duration = 58 + layout.ringIndex * 6;
      const peerId = escapeHtml(String(peer.id || ""));
      const peerName = escapeHtml(String(peer.name || ""));
      const peerLabel = escapeHtml(this.translate("openPeer", { name: peer.name || "" }));
      return `
        <div
          class="peer-node"
          data-stage="${stage}"
          data-ring-index="${layout.ringIndex}"
          style="--angle:${layout.angle}deg;--radius:${radius};--orbit-duration:${duration}s"
        >
          <button type="button" data-peer-id="${peerId}" aria-label="${peerLabel}">
            ${staticAvatarMarkup(peer.avatar)}
          </button>
          <span>${peerName}</span>
        </div>
      `;
    }).join("");
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
      this.nodes.connectedPeer.innerHTML = peer?.avatar ? staticAvatarMarkup(peer.avatar) : "";
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
    if (this.nodes.sendConfirm) {
      this.nodes.sendConfirm.hidden = state.files.length === 0;
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
    this.renderReceivedList(state);
    this.renderChat(state);
  }

  renderReceivedList(state) {
    if (!this.nodes.receivedList) return;
    const receivedItems = visibleReceivedItems(state);
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
          <span>${escapeHtml(item.size)}</span>
        </div>
        ${item.url
          ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${this.translate("open")}</a>`
          : `<button type="button" data-action="open-received" data-transfer-id="${escapeHtml(item.transferId || "")}" data-file-id="${escapeHtml(item.id || "")}">${this.translate("open")}</button>`}
      </div>
    `).join("");
  }

  renderChat(state) {
    if (!this.nodes.chatPanel) return;
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
    requestAnimationFrame(() =>
      this.nodes.chatPanel.scrollTo({
        top: this.nodes.chatPanel.scrollHeight,
        behavior: "smooth"
      })
    );
  }

  openPeerSheet(peer, { peers }) {
    this.nodes.sheetPeerName.textContent = peer.name;
    renderAnimatedAvatar(this.nodes.sheetPeerAvatar, peer.avatar, 1);
    this.nodes.sheetCopy.textContent = this.translate("peerSheetReadyCopy");
    this.nodes.friendStrip.innerHTML = peers.slice(0, 5).map((item, index) =>
      animatedAvatarMarkup(item.avatar, index)
    ).join("") + "<span>+</span>";
    this.resetSwipe?.();
    this.showSheet(this.nodes.peerSheet);
  }

  closePeerSheet() {
    return this.hideSheet(this.nodes.peerSheet);
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
    this.nodes.app.dataset.sheetOpen = "true";
    this.setSheetBackgroundInert(true);
    this.showBackdrop();
    this.focusSheet(sheet);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sheet.classList.add("is-open");
        this.afterTransition(sheet, () => {
          this.focusSheet(sheet);
          onShown?.();
        });
      });
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
      if (!keepBackdrop) this.hideBackdropIfIdle();
      const finish = () => {
        sheet.hidden = true;
        sheet.classList.remove("is-closing");
        this.sheetHideTimers.delete(sheet);
        const anyVisible = [
          this.nodes.peerSheet,
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

  visibleSheet() {
    return [
      this.nodes.peerSheet,
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
  return text.replace(/[&<>"']/g, (char) => ({
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

function normalizedPeerStage(peer, state) {
  if (state.connectedPeerId === peer.id) return "near";
  if (state.mode === "connected") return "lobby";
  if (state.selectedPeerId === peer.id && state.mode === "verifying") return "verify";
  if (state.pendingInviteId === peer.id || peer.stage === "intent") return "intent";
  return ["lobby", "near", "intent", "verify"].includes(peer.stage) ? peer.stage : "lobby";
}

function peerOrbitLayout(peer, index) {
  const ring = Number(peer.ringIndex ?? index);
  const angle = Number(peer.angle ?? index * 72);
  return {
    ringIndex: Number.isInteger(ring) && ring >= 0 && ring < ORBIT_RADII.length
      ? ring
      : index % ORBIT_RADII.length,
    angle: Number.isFinite(angle) ? angle : index * 72
  };
}

function visibleReceivedItems(state) {
  return state.receivedItems.filter((item) => !item.locale || item.locale === state.locale);
}

function animatedAvatarMarkup(avatar, stagger = 0) {
  const frames = animatedFramesForAvatar(avatar);
  if (!frames.length) {
    return `<img src="${escapeHtml(avatar)}" alt="">`;
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

function staticAvatarMarkup(avatar) {
  const frame = animatedFramesForAvatar(avatar)[0] || avatar;
  return `<img class="avatar-static" src="${escapeHtml(frame)}" alt="">`;
}

function renderAnimatedAvatar(node, avatar, stagger = 0) {
  const avatarKey = `animated:${avatar}`;
  if (node.dataset.avatarKey === avatarKey) return;
  const frames = animatedFramesForAvatar(avatar);
  if (!frames.length) {
    node.innerHTML = `<img src="${escapeHtml(avatar)}" alt="">`;
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
  const avatarKey = `static:${avatar}`;
  if (node.dataset.avatarKey === avatarKey) return;
  node.innerHTML = staticAvatarMarkup(avatar);
  node.dataset.avatarKey = avatarKey;
}

function avatarFrameDelay(index) {
  if (index === 0) return "0s";
  return `${-(36 - index * 6)}s`;
}

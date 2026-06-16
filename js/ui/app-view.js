import { Emitter } from "../utils/emitter.js";
import { formatBytes } from "../utils/format.js";
import { AVATAR_OPTIONS, animatedFramesForAvatar } from "../config/avatar-options.js";
import { translate } from "../config/i18n.js";
import { DynamicIsland } from "./dynamic-island.js";

const ORBIT_RADII = [".46", ".37", ".28", ".19"];
const ORBIT_PEER_LIMIT = 12;
const CONNECTED_ORBIT_PEER_LIMIT = 6;
const CONNECTED_ORBIT_RADII = [
  "calc(var(--orbit-size) * .46)",
  "calc(var(--orbit-size) * .37)",
  "calc(var(--orbit-size) * .28)"
];
const ORBIT_LAYOUT_SLOTS = [
  { ringIndex: 0, angle: 352 },
  { ringIndex: 1, angle: 174 },
  { ringIndex: 2, angle: 73 },
  { ringIndex: 3, angle: 277 },
  { ringIndex: 0, angle: 227 },
  { ringIndex: 1, angle: 126 },
  { ringIndex: 2, angle: 23 },
  { ringIndex: 3, angle: 204 },
  { ringIndex: 0, angle: 48 },
  { ringIndex: 1, angle: 314 },
  { ringIndex: 2, angle: 343 },
  { ringIndex: 0, angle: 94 }
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
      nearbySheet: document.querySelector("[data-nearby-sheet]"),
      nearbySearch: document.querySelector("[data-nearby-search]"),
      nearbyList: document.querySelector("[data-nearby-list]"),
      nearbyOverflowCount: document.querySelector("[data-nearby-overflow-count]"),
      nearbyFilterChoice: document.querySelector(".nearby-filter-choice"),
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
      nameInput: document.querySelector("[data-name-input]"),
      currentDevice: document.querySelector("[data-current-device]"),
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
      document.querySelector(".nearby-fab"),
      document.querySelector("[data-connection-tray]"),
      document.querySelector("[data-dynamic-island]")
    ].filter(Boolean);
    this.nearbyFilter = "all";
    this.nearbyQuery = "";
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
      if (action === "set-nearby-filter") {
        this.nearbyFilter = actionTarget.dataset.nearbyFilter || "all";
        this.renderNearbyDirectory(this.currentState);
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

    this.nodes.nearbySearch?.addEventListener("input", (event) => {
      this.nearbyQuery = event.target.value;
      this.renderNearbyDirectory(this.currentState);
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
    this.renderCurrentDevice(state);
    const connectedPeer = state.peers.find((peer) => peer.id === state.connectedPeerId);
    this.nodes.connectionLabel.textContent = connectedPeer
      ? this.translate("connectedWith", { name: connectedPeer.name })
      : this.translate("lookingNearby");
    this.renderAvatarSettings(state);
    this.renderCapabilities(state.capabilities);
    this.renderPeers(state);
    this.renderNearbyDirectory(state);
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
        return `${peer.id}:${peer.name}:${peer.avatar}:${stage}:${layout.ringIndex}:${layout.angle}`;
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

  renderNearbyDirectory(state) {
    if (!state || !this.nodes.nearbyList) return;
    const rankedPeers = rankPeersForDisplay(state.peers, state);
    const visibleLimit = state.connectedPeerId ? CONNECTED_ORBIT_PEER_LIMIT : ORBIT_PEER_LIMIT;
    const hiddenCount = Math.max(0, rankedPeers.length - visibleLimit);
    if (this.nodes.nearbyOverflowCount) {
      this.nodes.nearbyOverflowCount.hidden = hiddenCount <= 0;
      this.nodes.nearbyOverflowCount.textContent = hiddenCount > 99 ? "99+" : String(hiddenCount);
    }
    this.nodes.nearbyFilterChoice?.querySelectorAll("[data-nearby-filter]").forEach((button) => {
      const selected = button.dataset.nearbyFilter === this.nearbyFilter;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const query = normalizeSearch(this.nearbyQuery);
    const filtered = rankedPeers.filter((peer) => {
      if (!matchesNearbyFilter(peer, state, this.nearbyFilter)) return false;
      if (!query) return true;
      return normalizeSearch(`${peer.name} ${peerDeviceLabel(peer)} ${peerDeviceFamily(peer)}`).includes(query);
    });
    if (!filtered.length) {
      this.nodes.nearbyList.innerHTML = `<div class="nearby-empty">${this.translate("nearbyEmpty")}</div>`;
      return;
    }
    this.nodes.nearbyList.innerHTML = filtered.map((peer) => {
      const peerId = escapeHtml(String(peer.id || ""));
      const name = escapeHtml(String(peer.name || ""));
      const device = escapeHtml(peerDeviceLabel(peer));
      const brand = deviceBrandMarkup(peer);
      const distance = escapeHtml(this.translate(peerDistanceKey(peer)));
      const score = Math.max(0, Math.min(100, Math.round(peer.__rankScore || 0)));
      return `
        <article class="nearby-device-row" data-nearby-device-id="${peerId}">
          <span class="nearby-device-avatar" aria-hidden="true">${staticAvatarMarkup(peer.avatar)}</span>
          <div class="nearby-device-copy">
            <strong class="nearby-device-name">${brand}<span>${name}</span></strong>
            <span>${device}</span>
            <span class="nearby-device-meta">
              <span class="nearby-pill">${distance}</span>
              <span class="nearby-pill">${this.translate("rankScore", { score })}</span>
              ${peerPreviouslyConnected(peer) ? `<span class="nearby-pill">${this.translate("connectedBefore")}</span>` : ""}
            </span>
          </div>
          <button class="nearby-connect" type="button" data-peer-id="${peerId}">${this.translate("connect")}</button>
        </article>
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
    if (this.nodes.nearbySheet && !this.nodes.nearbySheet.hidden) {
      this.hideSheet(this.nodes.nearbySheet, undefined, { keepBackdrop: true });
    }
    this.nodes.sheetPeerName.textContent = peer.name;
    renderAnimatedAvatar(this.nodes.sheetPeerAvatar, peer.avatar, 1);
    this.nodes.sheetCopy.textContent = this.translate("peerSheetReadyCopy");
    this.nodes.friendStrip.innerHTML = peers.slice(0, 5).map((item, index) =>
      animatedAvatarMarkup(item.avatar, index)
    ).join("") + "<span>+</span>";
    this.resetSwipe?.();
    this.showSheet(this.nodes.peerSheet);
  }

  openNearbySheet() {
    if (this.nodes.nearbySearch) this.nodes.nearbySearch.value = this.nearbyQuery;
    this.renderNearbyDirectory(this.currentState);
    this.showSheet(this.nodes.nearbySheet, () => this.nodes.nearbySearch?.focus({ preventScroll: true }));
  }

  closeNearbySheet() {
    return this.hideSheet(this.nodes.nearbySheet);
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
      this.nodes.nearbySheet,
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
          this.nodes.nearbySheet,
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
      this.nodes.nearbySheet,
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
      this.nodes.nearbySheet,
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

const DEVICE_ICON_PATHS = Object.freeze({
  apple: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701",
  samsung: "M19.8166 10.2808l.0459 2.6934h-.023l-.7793-2.6934h-1.2837v3.3925h.8481l-.0458-2.785h.023l.8366 2.785h1.2264v-3.3925zm-16.149 0l-.6418 3.427h.9284l.4699-3.1175h.0229l.4585 3.1174h.9169l-.6304-3.4269zm5.1805 0l-.424 2.6132h-.023l-.424-2.6132H6.5788l-.0688 3.427h.8596l.023-3.0832h.0114l.573 3.0831h.8711l.5731-3.083h.023l.0228 3.083h.8596l-.0802-3.4269zm-7.2664 2.4527c.0343.0802.0229.1949.0114.2522-.0229.1146-.1031.2292-.3324.2292-.2177 0-.3438-.126-.3438-.3095v-.3323H0v.2636c0 .7679.6074.9971 1.2493.9971.6189 0 1.1346-.2178 1.2149-.7794.0458-.298.0114-.4928 0-.5616-.1605-.722-1.467-.9283-1.5588-1.3295-.0114-.0688-.0114-.1375 0-.1834.023-.1146.1032-.2292.3095-.2292.2063 0 .321.126.321.3095v.2063h.8595v-.2407c0-.745-.6762-.8596-1.1576-.8596-.6074 0-1.1117.2063-1.2034.7564-.023.149-.0344.2866.0114.4585.1376.7106 1.364.9169 1.5358 1.3524m11.152 0c.0343.0803.0228.1834.0114.2522-.023.1146-.1032.2292-.3324.2292-.2178 0-.3438-.126-.3438-.3095v-.3323h-.917v.2636c0 .7564.596.9857 1.2379.9857.6189 0 1.1232-.2063 1.2034-.7794.0459-.298.0115-.4814 0-.5616-.1375-.7106-1.4327-.9284-1.5243-1.318-.0115-.0688-.0115-.1376 0-.1835.0229-.1146.1031-.2292.3094-.2292.1948 0 .321.126.321.3095v.2063h.848v-.2407c0-.745-.6647-.8596-1.146-.8596-.6075 0-1.1004.1948-1.192.7564-.023.149-.023.2866.0114.4585.1376.7106 1.341.9054 1.513 1.3524m2.8882.4585c.2407 0 .3094-.1605.3323-.2522.0115-.0343.0115-.0917.0115-.126v-2.533h.871v2.4642c0 .0688 0 .1948-.0114.2292-.0573.6419-.5616.8482-1.192.8482-.6303 0-1.1346-.2063-1.192-.8482 0-.0344-.0114-.1604-.0114-.2292v-2.4642h.871v2.533c0 .0458 0 .0916.0115.126 0 .0917.0688.2522.3095.2522m7.1518-.0344c.2522 0 .3324-.1605.3553-.2522.0115-.0343.0115-.0917.0115-.126v-.4929h-.3553v-.5043H24v.917c0 .0687 0 .1145-.0115.2292-.0573.6303-.596.8481-1.2034.8481-.6075 0-1.1461-.2178-1.2034-.8481-.0115-.1147-.0115-.1605-.0115-.2293v-1.444c0-.0574.0115-.172.0115-.2293.0802-.6419.596-.8482 1.2034-.8482s1.1347.2063 1.2034.8482c.0115.1031.0115.2292.0115.2292v.1146h-.8596v-.1948s0-.0803-.0115-.1261c-.0114-.0802-.0802-.2521-.3438-.2521-.2521 0-.321.1604-.3438.2521-.0115.0458-.0115.1032-.0115.1605v1.5702c0 .0458 0 .0916.0115.126 0 .0917.0917.2522.3323.2522",
  android: "M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z",
  google: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
  windows: "M3 4.5 10.5 3.4v8.1H3V4.5Zm8.5-1.25L21 2v9.5h-9.5V3.25ZM3 12.5h7.5v8.1L3 19.5v-7Zm8.5 0H21V22l-9.5-1.25v-8.25Z",
  device: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 3v14h10V5H7Zm3 15h4v1h-4v-1Z"
});

function deviceBrandMarkup(peer) {
  const brand = deviceBrand(peer);
  return `
    <span class="device-brand device-brand--${brand}" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="${DEVICE_ICON_PATHS[brand] || DEVICE_ICON_PATHS.device}"></path>
      </svg>
    </span>
  `;
}

function deviceBrand(peer) {
  const family = peerDeviceFamily(peer);
  const label = peerDeviceLabel(peer).toLowerCase();
  if (label.includes("samsung") || label.includes("galaxy")) return "samsung";
  if (label.includes("pixel")) return "google";
  if (["ios", "ipad", "macos", "watchos"].includes(family) || /(iphone|ipad|mac|apple)/.test(label)) return "apple";
  if (family === "android") return "android";
  if (family === "windows") return "windows";
  return "device";
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

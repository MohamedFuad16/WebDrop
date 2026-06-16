import qrcode from "../vendor/qrcode-generator.mjs";
import { Emitter } from "../utils/emitter.js";
import { animatedFramesForAvatar } from "../config/avatar-options.js";

export class DynamicIsland extends Emitter {
  constructor(document, translate) {
    super();
    this.document = document;
    this.translate = translate;
    this.root = document.querySelector("[data-dynamic-island]");
    this.nodes = {
      selfName: this.root?.querySelector("[data-island-self-name]"),
      peerName: this.root?.querySelector("[data-island-peer-name]"),
      selfAvatar: this.root?.querySelector("[data-island-self-avatar]"),
      peerAvatar: this.root?.querySelector("[data-island-peer-avatar]"),
      title: this.root?.querySelector("[data-island-qr-title]"),
      status: this.root?.querySelector("[data-island-qr-status]"),
      camera: this.root?.querySelector("[data-island-camera]"),
      cancel: this.root?.querySelector("[data-island-cancel]"),
      scanner: this.root?.querySelector("[data-island-scanner]"),
      canvas: this.root?.querySelector("[data-island-qr-canvas]"),
      video: this.root?.querySelector("[data-island-video]")
    };
    this.state = "closed";
    this.stream = null;
    this.scanFrame = 0;
    this.cameraStartTimer = 0;
    this.lastDetectionAt = 0;
    this.currentConnectedPeerId = null;
    this.autoHideTimer = 0;
    this.closeTimer = 0;
    this.closePromise = null;
    this.closeResolver = null;
    this.closeTransitionCleanup = null;
    this.connectionOpenedAt = 0;
    this.connectionDelayTimer = 0;
    this.connectionDelayResolver = null;
    this.cameraRequestId = 0;
    this.detectionPaused = false;
    this.previousFocus = null;
    this.copyKeys = { title: null, status: null };
    this.backgroundNodes = [...document.querySelectorAll(".topbar, .main-stage, .connection-tray, [data-backdrop], [data-sheet]")];
    this.nodes.camera?.addEventListener("click", () => this.startCamera());
    this.nodes.cancel?.addEventListener("click", () => this.emit("cancel"));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.state.startsWith("qr-")) {
        event.preventDefault();
        this.emit("cancel");
        return;
      }
      if (event.key === "Tab" && this.state.startsWith("qr-")) this.trapFocus(event);
    });
    window.addEventListener("pagehide", () => this.stopCamera());
  }

  sync(state) {
    this.refreshLocale();
    const peer = state.peers.find((item) => item.id === state.connectedPeerId);
    if (state.mode === "connected" && peer && this.currentConnectedPeerId !== peer.id) {
      this.showConnection(state.self, peer);
    } else if (state.mode === "disconnecting" && !["closed", "closing"].includes(this.state)) {
      this.close();
    } else if (state.mode === "lobby" && !this.state.startsWith("qr-")) {
      this.currentConnectedPeerId = null;
      if (!["closed", "closing"].includes(this.state)) this.close();
    }
  }

  showConnectionProgress(self, peer) {
    this.cancelConnectionMinimum(false);
    this.prepareToOpen(false);
    this.stopCamera();
    this.copyKeys = { title: null, status: null };
    this.currentConnectedPeerId = peer.id;
    this.connectionOpenedAt = this.now();
    this.renderPeople(self, peer);
    this.setState("connecting");
  }

  showConnection(self, peer) {
    this.cancelConnectionMinimum(false);
    this.prepareToOpen(false);
    this.stopCamera();
    this.copyKeys = { title: null, status: null };
    this.currentConnectedPeerId = peer.id;
    this.connectionOpenedAt = this.now();
    this.renderPeople(self, peer);
    this.setState("connected");
    clearTimeout(this.autoHideTimer);
    this.autoHideTimer = window.setTimeout(() => this.hide(), 4200);
  }

  showQrDisplay({ self, peer, token }) {
    this.prepareToOpen(true);
    this.stopCamera();
    this.renderPeople(self, peer);
    this.setState("qr-display");
    this.setCopy("qrShowTitle", "qrShowStatus");
    this.drawQr(token);
  }

  showQrScanner({ self, peer, autoStartCamera = true }) {
    this.prepareToOpen(true);
    this.stopCamera();
    this.renderPeople(self, peer);
    this.setState("qr-scan");
    this.setCopy("qrScanTitle", "qrScanStatus");
    this.nodes.scanner?.classList.remove("is-success", "is-live");
    this.nodes.cancel?.focus({ preventScroll: true });
    if (autoStartCamera) {
      this.cameraStartTimer = this.scheduleTimeout(() => {
        this.cameraStartTimer = 0;
        this.startCamera();
      }, 280);
    }
  }

  markSuccess() {
    this.stopCamera();
    this.nodes.scanner?.classList.add("is-success");
    this.setStatus("qrConnected");
  }

  close() {
    if (this.state === "closed") return Promise.resolve(true);
    if (this.state === "closing" && this.closePromise) return this.closePromise;
    this.cancelConnectionMinimum(false);
    clearTimeout(this.autoHideTimer);
    this.cancelCloseTransition(false);
    this.stopCamera();
    this.setState("closing");
    if (this.root?.contains(this.document.activeElement)) {
      this.document.activeElement.blur?.();
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    this.closePromise = new Promise((resolve) => {
      this.closeResolver = resolve;
    });
    const finish = () => this.hide({ completedClose: true });
    const onTransitionEnd = (event) => {
      if (event.target === this.root && event.propertyName === "transform") finish();
    };
    this.root?.addEventListener("transitionend", onTransitionEnd);
    this.closeTransitionCleanup = () => this.root?.removeEventListener("transitionend", onTransitionEnd);
    this.closeTimer = window.setTimeout(finish, reduced ? 110 : 720);
    return this.closePromise;
  }

  async finishConnectionTransition() {
    const minimumVisibleMs = this.prefersReducedMotion() ? 80 : 1600;
    const elapsedMs = Math.max(0, this.now() - this.connectionOpenedAt);
    const canClose = await this.waitForConnectionMinimum(Math.max(0, minimumVisibleMs - elapsedMs));
    if (!canClose || !["connecting", "qr-display", "qr-scan"].includes(this.state)) return false;
    return this.close();
  }

  hide({ completedClose = false } = {}) {
    this.cancelConnectionMinimum(false);
    clearTimeout(this.autoHideTimer);
    clearTimeout(this.closeTimer);
    this.closeTimer = 0;
    this.closeTransitionCleanup?.();
    this.closeTransitionCleanup = null;
    this.stopCamera();
    this.nodes.scanner?.classList.remove("is-success", "is-live");
    this.setState("closed");
    this.setBackgroundInert(false);
    this.previousFocus?.focus?.({ preventScroll: true });
    this.previousFocus = null;
    this.copyKeys = { title: null, status: null };
    this.connectionOpenedAt = 0;
    this.resolveClose(completedClose);
  }

  setState(state) {
    this.state = state;
    if (this.root) {
      const concealed = state === "closed" || state === "closing";
      this.root.dataset.state = state;
      this.root.setAttribute("aria-hidden", String(concealed));
      this.root.setAttribute("role", state.startsWith("qr-") ? "dialog" : "status");
      this.root.setAttribute("aria-modal", String(state.startsWith("qr-")));
      this.root.inert = concealed;
    }
  }

  focusableElements() {
    return [...this.root.querySelectorAll(
      "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )].filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true");
  }

  trapFocus(event) {
    const focusable = this.focusableElements();
    if (!focusable.length) {
      event.preventDefault();
      this.root.focus?.({ preventScroll: true });
      return;
    }
    const active = this.document.activeElement;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!this.root.contains(active)) {
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

  prepareToOpen(interactive) {
    clearTimeout(this.autoHideTimer);
    this.cancelCloseTransition(false);
    if (interactive) {
      this.previousFocus = this.document.activeElement;
      this.setBackgroundInert(true);
    } else {
      this.previousFocus = null;
      this.setBackgroundInert(false);
    }
  }

  cancelCloseTransition(result) {
    clearTimeout(this.closeTimer);
    this.closeTimer = 0;
    this.closeTransitionCleanup?.();
    this.closeTransitionCleanup = null;
    this.resolveClose(result);
  }

  resolveClose(result) {
    const resolve = this.closeResolver;
    this.closeResolver = null;
    this.closePromise = null;
    resolve?.(result);
  }

  waitForConnectionMinimum(delayMs) {
    if (delayMs <= 0) return Promise.resolve(true);
    this.cancelConnectionMinimum(false);
    return new Promise((resolve) => {
      this.connectionDelayResolver = resolve;
      this.connectionDelayTimer = this.scheduleTimeout(() => {
        this.connectionDelayTimer = 0;
        this.connectionDelayResolver = null;
        resolve(true);
      }, delayMs);
    });
  }

  cancelConnectionMinimum(result) {
    if (this.connectionDelayTimer) this.cancelTimeout(this.connectionDelayTimer);
    this.connectionDelayTimer = 0;
    const resolve = this.connectionDelayResolver;
    this.connectionDelayResolver = null;
    resolve?.(result);
  }

  now() {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  scheduleTimeout(callback, delayMs) {
    return window.setTimeout(callback, delayMs);
  }

  cancelTimeout(timer) {
    window.clearTimeout(timer);
  }

  setBackgroundInert(inert) {
    this.backgroundNodes.forEach((node) => {
      if (node && !node.contains(this.root)) node.inert = inert;
    });
  }

  setCopy(titleKey, statusKey) {
    this.copyKeys = { title: titleKey, status: statusKey };
    this.refreshLocale();
  }

  setStatus(statusKey) {
    this.copyKeys = { ...this.copyKeys, status: statusKey };
    if (this.nodes.status) this.nodes.status.textContent = this.translate(statusKey);
  }

  refreshLocale() {
    if (this.copyKeys.title && this.nodes.title) {
      this.nodes.title.textContent = this.translate(this.copyKeys.title);
    }
    if (this.copyKeys.status && this.nodes.status) {
      this.nodes.status.textContent = this.translate(this.copyKeys.status);
    }
    if (this.nodes.camera) this.nodes.camera.textContent = this.translate("startCamera");
  }

  renderPeople(self, peer) {
    this.nodes.selfName.textContent = self.name;
    this.nodes.peerName.textContent = peer.name;
    renderAvatar(this.nodes.selfAvatar, self.avatar);
    renderAvatar(this.nodes.peerAvatar, peer.avatar);
  }

  drawQr(token) {
    if (!token || !this.nodes.canvas) return;
    const qr = qrcode(0, "M");
    qr.addData(token);
    qr.make();
    const canvas = this.nodes.canvas;
    const context = canvas.getContext("2d");
    const count = qr.getModuleCount();
    const pad = 12;
    const size = canvas.width - pad * 2;
    const cell = size / count;
    context.fillStyle = "#f4f5f7";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#15171b";
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (!qr.isDark(row, column)) continue;
        context.fillRect(
          Math.floor(pad + column * cell),
          Math.floor(pad + row * cell),
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setStatus("cameraUnavailable");
      return;
    }
    if (!("BarcodeDetector" in window)) {
      this.stopCamera();
      this.setStatus("qrDetectorUnavailable");
      return;
    }
    this.stopCamera();
    const requestId = ++this.cameraRequestId;
    this.nodes.camera.disabled = true;
    this.setStatus("cameraRequest");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } }
      });
      if (requestId !== this.cameraRequestId || this.state !== "qr-scan") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.nodes.video.srcObject = this.stream;
      await this.nodes.video.play();
      this.nodes.scanner.classList.add("is-live");
      this.setStatus("qrLooking");
      this.detector = new BarcodeDetector({ formats: ["qr_code"] });
      this.detectionPaused = false;
      this.scanFrame = requestAnimationFrame((now) => this.detect(now));
    } catch {
      this.stopCamera();
      this.setStatus("cameraUnavailable");
    } finally {
      this.nodes.camera.disabled = false;
    }
  }

  async detect(now) {
    if (!this.detector || !this.stream || this.state !== "qr-scan") return;
    if (this.detectionPaused) return;
    if (now - this.lastDetectionAt > 180 && this.nodes.video.readyState >= 2) {
      this.lastDetectionAt = now;
      try {
        const codes = await this.detector.detect(this.nodes.video);
        const value = codes.find((code) => code.rawValue)?.rawValue;
        if (value) {
          this.detectionPaused = true;
          this.emit("detected", value);
          return;
        }
      } catch {
        this.setStatus("qrLooking");
      }
    }
    this.scanFrame = requestAnimationFrame((next) => this.detect(next));
  }

  stopCamera() {
    if (this.cameraStartTimer) this.cancelTimeout(this.cameraStartTimer);
    this.cameraStartTimer = 0;
    this.cameraRequestId += 1;
    cancelAnimationFrame(this.scanFrame);
    this.scanFrame = 0;
    this.detector = null;
    this.detectionPaused = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.nodes.video) this.nodes.video.srcObject = null;
    this.nodes.scanner?.classList.remove("is-live");
  }

  retryScanner() {
    if (!this.stream || !this.detector || this.state !== "qr-scan") return;
    this.detectionPaused = false;
    this.setStatus("qrInvalid");
    cancelAnimationFrame(this.scanFrame);
    this.scanFrame = requestAnimationFrame((now) => this.detect(now));
  }
}

function renderAvatar(node, avatar) {
  const src = animatedFramesForAvatar(avatar)[0] || avatar;
  node.innerHTML = `<img src="${escapeHtml(src)}" alt="">`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

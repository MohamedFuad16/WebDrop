import qrcode from "../vendor/qrcode-generator.mjs?v=1.0.93";
import { Emitter } from "../utils/emitter.js?v=1.0.93";
import { formatBytes } from "../utils/format.js?v=1.0.93";
import { animatedFramesForAvatar, normalizeAvatarChoice } from "../config/avatar-options.js?v=1.0.93";
import { TileWave } from "./tile-wave.js?v=1.0.93";
import { BUMP_SCORE_POINTS } from "../services/proximity-engine.js?v=1.0.93";

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
      video: this.root?.querySelector("[data-island-video]"),
      wave: this.root?.querySelector("[data-island-wave]"),
      content: this.root?.querySelector(".webdrop-island__content"),
      ceremony: this.root?.querySelector("[data-island-ceremony]"),
      ceremonyStage: this.root?.querySelector("[data-island-ceremony-stage]"),
      ceremonyScore: this.root?.querySelector("[data-island-ceremony-score]"),
      ceremonyError: this.root?.querySelector("[data-island-ceremony-error]"),
      failureActions: this.root?.querySelector("[data-island-failure-actions]"),
      retry: this.root?.querySelector("[data-island-retry]"),
      fallback: this.root?.querySelector("[data-island-fallback]"),
      audioMetric: this.root?.querySelector("[data-island-metric='audio']"),
      audioValue: this.root?.querySelector("[data-island-audio-value]"),
      bumpMetric: this.root?.querySelector("[data-island-metric='bump']"),
      bumpValue: this.root?.querySelector("[data-island-bump-value]"),
      tiltMetric: this.root?.querySelector("[data-island-metric='tilt']"),
      tiltValue: this.root?.querySelector("[data-island-tilt-value]"),
      transfer: this.root?.querySelector("[data-island-transfer]"),
      transferLabel: this.root?.querySelector("[data-island-transfer-label]"),
      transferPercent: this.root?.querySelector("[data-island-transfer-percent]"),
      transferName: this.root?.querySelector("[data-island-transfer-name]")
    };
    try {
      this.wave = this.nodes.wave ? new TileWave(this.nodes.wave) : null;
      if (this.wave?.canvas) this.nodes.wave = this.wave.canvas;
    } catch {
      this.wave = null;
      this.nodes.wave?.setAttribute("hidden", "");
    }
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
    this.waveStabilizeFrame = 0;
    this.waveStabilizeTimer = 0;
    this.cameraRequestId = 0;
    this.detectionPaused = false;
    this.preparedCameraPromise = null;
    this.preparedCameraStream = null;
    this.scanCanvas = document.createElement("canvas");
    this.scanContext = this.scanCanvas.getContext("2d", { willReadFrequently: true });
    this.previousFocus = null;
    this.copyKeys = { title: null, status: null };
    this.transferDisplayRatio = 0;
    this.transferTargetRatio = 0;
    this.transferAnimationFrame = 0;
    this.failureScrollFrame = 0;
    this.backgroundNodes = [...document.querySelectorAll(".topbar, .main-stage, .connection-tray, [data-backdrop], [data-sheet]")];
    this.nodes.camera?.addEventListener("click", () => this.startCamera());
    this.nodes.cancel?.addEventListener("click", () => this.emit("cancel"));
    this.nodes.retry?.addEventListener("click", () => this.emit("retry"));
    this.nodes.fallback?.addEventListener("click", () => this.emit("fallback"));
    document.addEventListener("keydown", (event) => {
      const interactive = this.state.startsWith("qr-") || this.state === "verification-failed";
      if (event.key === "Escape" && interactive) {
        event.preventDefault();
        this.emit("cancel");
        return;
      }
      if (event.key === "Tab" && interactive) this.trapFocus(event);
    });
    const keepFailureActionsVisible = () => this.scheduleFailureActionsVisibility();
    window.addEventListener("resize", keepFailureActionsVisible, { passive: true });
    window.visualViewport?.addEventListener("resize", keepFailureActionsVisible, { passive: true });
    window.addEventListener("pagehide", () => this.stopCamera());
  }

  sync(state) {
    this.refreshLocale();
    const peer = state.peers.find((item) => item.id === state.connectedPeerId);
    if (state.mode === "connected" && peer && state.transfer) {
      this.showTransferProgress(state.self, peer, state.transfer);
    } else if (this.state === "transfer" && !state.transfer) {
      this.close();
    } else if (state.mode === "connected" && peer && this.currentConnectedPeerId !== peer.id) {
      this.showConnection(state.self, peer);
    } else if (state.mode === "disconnecting" && !["closed", "closing"].includes(this.state)) {
      this.close();
    } else if (state.mode === "lobby" && !this.state.startsWith("qr-") && this.state !== "verification-failed") {
      this.currentConnectedPeerId = null;
      if (!["closed", "closing"].includes(this.state)) this.close();
    }
  }

  showConnectionProgress(self, peer, ceremony = null) {
    this.cancelConnectionMinimum(false);
    this.prepareToOpen(false);
    this.stopCamera();
    this.copyKeys = { title: null, status: null };
    this.currentConnectedPeerId = peer.id;
    this.connectionOpenedAt = this.now();
    this.renderPeople(self, peer);
    this.resetCeremony();
    this.setState("connecting");
    if (ceremony) this.renderVerifiedCeremony(ceremony);
  }

  showAnonymousConnectionProgress(self) {
    this.cancelConnectionMinimum(false);
    this.prepareToOpen(false);
    this.stopCamera();
    this.copyKeys = { title: null, status: null };
    this.currentConnectedPeerId = null;
    this.connectionOpenedAt = this.now();
    this.renderPeople(self, {
      name: this.translate("anonymousNearbyPeer"),
      anonymous: true
    });
    this.resetCeremony();
    this.setState("connecting");
  }

  showQrPreparing({ self, peer, role = "show" }) {
    this.prepareToOpen(true);
    this.stopCamera({ preservePrepared: role === "scan" });
    this.renderPeople(self, peer);
    this.setState("qr-preparing");
    this.setCopy(
      role === "scan" ? "qrScanTitle" : "qrShowTitle",
      role === "scan" ? "qrWaitingToScan" : "qrPreparingCode"
    );
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

  showTransferProgress(self, peer, transfer = {}) {
    const opening = this.state !== "transfer";
    this.setTransferDirection(transfer.direction);
    if (opening) {
      this.cancelConnectionMinimum(false);
      this.prepareToOpen(false);
      this.stopCamera();
      this.resetTransferProgress();
      clearTimeout(this.autoHideTimer);
      this.copyKeys = { title: null, status: null };
      this.currentConnectedPeerId = peer.id;
      this.renderPeople(self, peer);
      this.setState("transfer");
    } else if (this.currentConnectedPeerId !== peer.id) {
      this.currentConnectedPeerId = peer.id;
      this.renderPeople(self, peer);
    }
    this.renderTransfer(transfer);
  }

  showQrDisplay({ self, peer, token }) {
    this.prepareToOpen(true);
    this.stopCamera();
    this.renderPeople(self, peer);
    this.setState("qr-display");
    this.setCopy("qrShowTitle", "qrShowStatus");
    this.drawQr(token, self?.avatar);
  }

  showQrScanner({ self, peer, autoStartCamera = true }) {
    this.prepareToOpen(true);
    this.stopCamera({ preservePrepared: true });
    this.renderPeople(self, peer);
    this.setState("qr-scan");
    this.setCopy("qrScanTitle", "qrScanStatus");
    this.nodes.scanner?.classList.remove("is-success", "is-live");
    // Clear any QR left over from a prior "show" so the scan frame doesn't show a
    // stale code behind the viewfinder while the camera comes up. (Detection uses
    // the separate offscreen scanCanvas, so clearing the display canvas is safe.)
    const displayCanvas = this.nodes.canvas;
    displayCanvas?.getContext("2d")?.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    this.nodes.cancel?.focus({ preventScroll: true });
    if (autoStartCamera) {
      this.cameraStartTimer = this.scheduleTimeout(() => {
        this.cameraStartTimer = 0;
        this.startCamera();
      }, 40);
    }
  }

  markSuccess() {
    this.stopCamera();
    this.nodes.scanner?.classList.add("is-success");
    this.setStatus("qrConnected");
  }

  updateCeremony({ phase, state, permissions, acoustic, motion, score } = {}) {
    if (!this.nodes.ceremony || !["connecting", "verification-failed"].includes(this.state)) return;
    if (phase) this.root.dataset.ceremonyPhase = phase;
    const stageKeys = {
      permissions: "ceremonyPermissions",
      sync: "ceremonySync",
      audio: state === "active" ? "ceremonyAudioActive" : "ceremonyAudioComplete",
      motion: "ceremonyMotion",
      score: state === "failed" ? "ceremonyScoreFailed" : "ceremonyScore"
    };
    if (stageKeys[phase] && this.nodes.ceremonyStage) {
      this.nodes.ceremonyStage.textContent = this.translate(stageKeys[phase]);
    }
    if (permissions) {
      this.setMetricState(this.nodes.audioMetric, permissions.microphone?.granted ? "ready" : "failed");
      if (!permissions.microphone?.granted && this.nodes.audioValue) {
        this.nodes.audioValue.textContent = this.translate("ceremonyPermissionDenied");
      }
      const motionReady = permissions.motion?.granted;
      this.setMetricState(this.nodes.bumpMetric, motionReady ? "ready" : "failed");
      this.setMetricState(this.nodes.tiltMetric, motionReady ? "ready" : "failed");
    }
    if (phase === "audio") {
      const detected = Boolean(acoustic?.detected);
      this.setMetricState(this.nodes.audioMetric, state === "active" ? "active" : detected ? "complete" : "failed");
      if (this.nodes.audioValue) {
        this.nodes.audioValue.textContent = formatAcousticStatus(acoustic, {
          fallback: state === "active"
            ? this.translate("ceremonyAudioSending")
            : detected
              ? this.translate("ceremonyDetected")
              : this.translate("ceremonyMissed"),
          translate: this.translate.bind(this)
        });
      }
    }
    if (motion) this.renderMotionMetrics(motion);
    if (Number.isFinite(score) && this.nodes.ceremonyScore) {
      this.nodes.ceremonyScore.textContent = `${Math.round(score)} / 100`;
      this.nodes.ceremonyScore.dataset.passed = String(score >= 55);
    }
  }

  async showVerificationFailure({ score = 0, errors = [] } = {}) {
    if (!this.previousFocus || this.root?.contains(this.previousFocus)) {
      this.previousFocus = this.document.activeElement;
    }
    this.setBackgroundInert(true);
    this.setState("verification-failed");
    this.updateCeremony({ phase: "score", state: "failed", score });
    if (score >= 55 && this.nodes.ceremonyStage && errors.find(Boolean)) {
      this.nodes.ceremonyStage.textContent = errors.find(Boolean);
    }
    if (this.nodes.ceremonyError) {
      this.nodes.ceremonyError.hidden = false;
      this.nodes.ceremonyError.textContent = errors.filter(Boolean).join(" · ");
    }
    if (this.nodes.failureActions) this.nodes.failureActions.hidden = false;
    this.scheduleFailureActionsVisibility(true);
    return true;
  }

  scheduleFailureActionsVisibility(focusRetry = false) {
    if (this.state !== "verification-failed" || !this.nodes.failureActions) return;
    if (this.failureScrollFrame) window.cancelAnimationFrame(this.failureScrollFrame);
    this.failureScrollFrame = window.requestAnimationFrame(() => {
      this.failureScrollFrame = window.requestAnimationFrame(() => {
        this.failureScrollFrame = 0;
        if (this.state !== "verification-failed") return;
        this.nodes.failureActions.scrollIntoView({ block: "nearest", inline: "nearest" });
        if (focusRetry && !this.root.contains(this.document.activeElement)) {
          this.nodes.retry?.focus({ preventScroll: true });
        }
      });
    });
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
    const minimumVisibleMs = this.prefersReducedMotion() ? 80 : 2200;
    const elapsedMs = Math.max(0, this.now() - this.connectionOpenedAt);
    const canClose = await this.waitForConnectionMinimum(Math.max(0, minimumVisibleMs - elapsedMs));
    if (!canClose || !["connecting", "qr-preparing", "qr-display", "qr-scan"].includes(this.state)) return false;
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
      const qrDialog = state.startsWith("qr-");
      const failureDialog = state === "verification-failed";
      this.root.dataset.state = state;
      this.root.setAttribute("aria-hidden", String(concealed));
      this.root.setAttribute("role", failureDialog ? "alertdialog" : qrDialog ? "dialog" : "status");
      this.root.setAttribute("aria-modal", String(qrDialog || failureDialog));
      if (failureDialog) this.root.setAttribute("aria-describedby", "island-ceremony-error");
      else this.root.removeAttribute("aria-describedby");
      if (state !== "transfer") {
        delete this.root.dataset.transferDirection;
        this.wave?.setDirection(1);
      }
      this.root.inert = concealed;
      this.syncWave(state);
    }
    this.syncBrowserChrome(state);
  }

  syncBrowserChrome(state = this.state) {
    const meta = this.document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const expanded = !["closed", "closing"].includes(state);
    const theme = this.root?.closest(".app-shell")?.dataset.theme || "light";
    const color = expanded ? "#000000" : theme === "dark" ? "#171818" : "#f3f3f1";
    if (meta.getAttribute("content") !== color) meta.setAttribute("content", color);
  }

  setTransferDirection(direction) {
    const normalizedDirection = direction === "receive" ? "receive" : "send";
    if (this.root) this.root.dataset.transferDirection = normalizedDirection;
    this.wave?.setDirection(normalizedDirection === "receive" ? -1 : 1);
  }

  syncWave(state = this.state) {
    const appShell = this.root?.closest(".app-shell");
    const motionPaused = appShell?.dataset.motion === "paused";
    const waveState = ["connecting", "connected", "transfer"].includes(state);
    const shouldShowWave = waveState && !motionPaused;
    // The tiles themselves are the transfer progress bar: fill grows with ratio.
    this.wave?.setTransferMode(state === "transfer");
    if (!shouldShowWave) {
      this.cancelWaveStabilize();
      this.wave?.setRunning(false);
    } else if (this.prefersReducedMotion()) {
      this.wave?.setRunning(false);
      this.wave?.renderOnce();
    } else {
      this.wave?.setRunning(true);
      this.stabilizeWaveFrame();
    }
  }

  stabilizeWaveFrame() {
    if (!this.wave) return;
    this.cancelWaveStabilize();
    const render = () => {
      if (!["connecting", "connected", "transfer"].includes(this.state)) return;
      this.wave.resize?.();
      this.wave.renderOnce?.(0.35);
      if (!this.prefersReducedMotion()) this.wave.setRunning(true);
    };
    this.waveStabilizeFrame = requestAnimationFrame(() => {
      this.waveStabilizeFrame = 0;
      render();
    });
    this.waveStabilizeTimer = this.scheduleTimeout(() => {
      this.waveStabilizeTimer = 0;
      render();
    }, 180);
  }

  cancelWaveStabilize() {
    if (this.waveStabilizeFrame) cancelAnimationFrame(this.waveStabilizeFrame);
    if (this.waveStabilizeTimer) this.cancelTimeout(this.waveStabilizeTimer);
    this.waveStabilizeFrame = 0;
    this.waveStabilizeTimer = 0;
  }

  focusableElements() {
    return [...this.root.querySelectorAll(
      "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )].filter((node) => {
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || !node.getClientRects().length) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    });
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
    if (this.nodes.retry) this.nodes.retry.textContent = this.translate("retry");
    if (this.nodes.fallback) this.nodes.fallback.textContent = this.translate("useQrInstead");
  }

  renderPeople(self, peer) {
    this.nodes.selfName.textContent = self.name;
    this.nodes.peerName.textContent = peer.name;
    renderAvatar(this.nodes.selfAvatar, self.avatar);
    if (peer.anonymous) renderAnonymousAvatar(this.nodes.peerAvatar);
    else renderAvatar(this.nodes.peerAvatar, peer.avatar);
  }

  updatePeerProfile(peer) {
    if (!peer || this.currentConnectedPeerId !== peer.id) return;
    if (!["connecting", "connected", "transfer"].includes(this.state)) return;
    if (this.nodes.peerName) this.nodes.peerName.textContent = peer.name;
    if (peer.anonymous) renderAnonymousAvatar(this.nodes.peerAvatar);
    else renderAvatar(this.nodes.peerAvatar, peer.avatar);
  }

  resetCeremony() {
    if (this.nodes.ceremonyStage) this.nodes.ceremonyStage.textContent = this.translate("ceremonyPermissions");
    if (this.nodes.ceremonyScore) {
      this.nodes.ceremonyScore.textContent = `0 / 100`;
      delete this.nodes.ceremonyScore.dataset.passed;
    }
    if (this.nodes.ceremonyError) {
      this.nodes.ceremonyError.hidden = true;
      this.nodes.ceremonyError.textContent = "";
    }
    if (this.nodes.failureActions) this.nodes.failureActions.hidden = true;
    [this.nodes.audioMetric, this.nodes.bumpMetric, this.nodes.tiltMetric].forEach((node) => this.setMetricState(node, "waiting"));
    if (this.nodes.audioValue) this.nodes.audioValue.textContent = this.translate("ceremonyWaiting");
    if (this.nodes.bumpValue) this.nodes.bumpValue.textContent = "0.0";
    if (this.nodes.tiltValue) this.nodes.tiltValue.textContent = "0°";
  }

  renderVerifiedCeremony({ score = 100, acoustic = {}, motion = {} } = {}) {
    this.updateCeremony({
      phase: "audio",
      state: "complete",
      acoustic: { detected: true, ...acoustic }
    });
    this.updateCeremony({
      phase: "motion",
      state: "complete",
      motion
    });
    this.updateCeremony({
      phase: "score",
      state: "complete",
      score
    });
  }

  renderMotionMetrics(motion = {}) {
    const bump = Boolean(motion.bump);
    const beta = Number(motion.tilt?.beta || 0);
    const gamma = Number(motion.tilt?.gamma || 0);
    const degrees = Math.round(Math.max(Math.abs(beta), Math.abs(gamma)));
    this.setMetricState(this.nodes.bumpMetric, bump ? "complete" : motion.samples ? "active" : "waiting");
    this.setMetricState(this.nodes.tiltMetric, motion.tilted ? "complete" : motion.samples ? "active" : "waiting");
    if (this.nodes.bumpValue) {
      const bumpPoints = Number(motion.bumpScorePoints || BUMP_SCORE_POINTS);
      this.nodes.bumpValue.textContent = bump ? `+${bumpPoints}` : Number(motion.maxAcceleration || 0).toFixed(1);
    }
    if (this.nodes.tiltValue) this.nodes.tiltValue.textContent = `${degrees}°`;
  }

  setMetricState(node, state) {
    if (node) node.dataset.status = state;
  }

  renderTransfer(transfer = {}) {
    const ratio = clampRatio(transfer.ratio);
    const receiving = transfer.direction === "receive";
    const directionKey = receiving ? "receivingStatus" : "sending";
    const name = transfer.name || "";
    const bytes = Number.isFinite(transfer.transferredBytes) && Number.isFinite(transfer.totalBytes)
      ? `${formatBytes(transfer.transferredBytes)} / ${formatBytes(transfer.totalBytes)}`
      : "";
    if (this.nodes.transferLabel) this.nodes.transferLabel.textContent = this.translate(directionKey);
    if (this.nodes.transferName) {
      this.nodes.transferName.textContent = [name, bytes].filter(Boolean).join(" · ");
    }
    this.animateTransferProgress(ratio);
  }

  resetTransferProgress() {
    if (this.transferAnimationFrame) cancelAnimationFrame(this.transferAnimationFrame);
    this.transferAnimationFrame = 0;
    this.transferDisplayRatio = 0;
    this.transferTargetRatio = 0;
    this.paintTransferProgress(0);
  }

  animateTransferProgress(targetRatio) {
    const target = clampRatio(targetRatio);
    if (this.transferAnimationFrame) cancelAnimationFrame(this.transferAnimationFrame);
    const start = Number.isFinite(this.transferDisplayRatio) ? this.transferDisplayRatio : 0;
    this.transferTargetRatio = target;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const distance = Math.abs(target - start);
    if (reduced || distance < 0.004 || target < start) {
      this.paintTransferProgress(target);
      return;
    }
    const duration = Math.min(760, Math.max(300, distance * 1000));
    const startedAt = performance.now();
    const tick = (now) => {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 4);
      const value = start + (target - start) * eased;
      this.paintTransferProgress(value);
      if (elapsed < 1 && this.transferTargetRatio === target) {
        this.transferAnimationFrame = requestAnimationFrame(tick);
      } else {
        this.paintTransferProgress(target);
        this.transferAnimationFrame = 0;
      }
    };
    this.transferAnimationFrame = requestAnimationFrame(tick);
  }

  paintTransferProgress(ratio) {
    const value = clampRatio(ratio);
    this.transferDisplayRatio = value;
    // The animated tiles are the progress visual now — grow their lit region.
    this.wave?.setProgress(value);
    if (this.nodes.transferPercent) {
      this.nodes.transferPercent.textContent = `${Math.round(value * 100)}%`;
      this.nodes.transferPercent.style.setProperty("--transfer-progress", value.toFixed(4));
    }
  }

  drawQr(token, avatar) {
    if (!token || !this.nodes.canvas) return;
    const canvas = this.nodes.canvas;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Level "H" (~30% error correction) so the centred avatar badge can sit on
    // top of the code without ever making it unscannable.
    const qr = qrcode(0, "H");
    qr.addData(token);
    qr.make();
    const count = qr.getModuleCount();
    context.imageSmoothingEnabled = false;
    const pad = 22;
    const size = canvas.width - pad * 2;
    const cell = size / count;
    const finderColors = ["#1768e5", "#087d72", "#6045b8"];
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (!qr.isDark(row, column)) continue;
        context.fillStyle = qrFinderColor(row, column, count, finderColors) || "#071b33";
        context.fillRect(
          Math.floor(pad + column * cell),
          Math.floor(pad + row * cell),
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }

    // Personalised centre badge: punch a rounded white quiet zone, then clip the
    // user's avatar into it. Kept to ~24% of the code (well inside what level H
    // can recover) and drawn synchronously from cache to avoid any scan delay.
    this.currentQrToken = token;
    const center = canvas.width / 2;
    const badge = Math.round(size * 0.24);
    const knockout = badge + Math.max(6, Math.round(cell * 1.4));
    traceRoundedRect(context, center - knockout / 2, center - knockout / 2, knockout, knockout, knockout * 0.26);
    context.fillStyle = "#ffffff";
    context.fill();

    const paintBadge = (image) => {
      if (!image || this.state !== "qr-display" || this.currentQrToken !== token) return;
      const origin = center - badge / 2;
      context.save();
      traceRoundedRect(context, origin, origin, badge, badge, badge * 0.3);
      context.clip();
      context.imageSmoothingEnabled = true;
      try {
        context.drawImage(image, origin, origin, badge, badge);
      } catch {
        /* tainted/broken source — leave the clean white badge in place */
      }
      context.restore();
    };

    const src = normalizeAvatarChoice(avatar);
    const cached = qrLogoCache.get(src);
    if (cached && cached.complete && cached.naturalWidth) {
      paintBadge(cached);
    } else {
      loadQrLogo(src).then(paintBadge).catch(() => {});
    }
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setStatus("cameraUnavailable");
      return;
    }
    if (!("BarcodeDetector" in window) && typeof globalThis.jsQR !== "function") {
      this.stopCamera();
      this.setStatus("qrDetectorUnavailable");
      return;
    }
    const preparedPromise = this.preparedCameraPromise;
    const preparedStream = this.preparedCameraStream;
    if (!preparedPromise && !preparedStream) this.stopCamera();
    const requestId = preparedPromise || preparedStream ? this.cameraRequestId : ++this.cameraRequestId;
    this.nodes.camera.disabled = true;
    this.setStatus("cameraRequest");
    try {
      const stream = preparedStream || await preparedPromise || await requestCameraStream();
      if (!stream) throw new Error("Camera permission was not granted.");
      if (preparedPromise === this.preparedCameraPromise || preparedStream === this.preparedCameraStream) {
        this.preparedCameraPromise = null;
        this.preparedCameraStream = null;
      }
      if (requestId !== this.cameraRequestId || this.state !== "qr-scan") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.nodes.video.srcObject = this.stream;
      await waitForVideoReady(this.nodes.video);
      await this.nodes.video.play();
      this.nodes.scanner.classList.add("is-live");
      this.setStatus("qrLooking");
      try {
        this.detector = "BarcodeDetector" in window
          ? new BarcodeDetector({ formats: ["qr_code"] })
          : null;
      } catch {
        this.detector = null;
      }
      this.detectionPaused = false;
      this.scanFrame = requestAnimationFrame((now) => this.detect(now));
    } catch (error) {
      this.stopCamera();
      this.setStatus(["NotAllowedError", "SecurityError"].includes(error?.name) ? "cameraDenied" : "cameraUnavailable");
    } finally {
      this.nodes.camera.disabled = false;
    }
  }

  async detect(now) {
    if ((!this.detector && typeof globalThis.jsQR !== "function") || !this.stream || this.state !== "qr-scan") return;
    if (this.detectionPaused) return;
    if (now - this.lastDetectionAt > 180 && this.nodes.video.readyState >= 2) {
      this.lastDetectionAt = now;
      try {
        let value = null;
        if (this.detector) {
          try {
            value = (await this.detector.detect(this.nodes.video)).find((code) => code.rawValue)?.rawValue || null;
          } catch {
            this.detector = null;
          }
        }
        if (!value && typeof globalThis.jsQR === "function") value = this.detectQrWithFallback();
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

  prepareCameraFromGesture() {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.resolve(null);
    if (this.preparedCameraPromise || this.preparedCameraStream) {
      return this.preparedCameraPromise || Promise.resolve(this.preparedCameraStream);
    }
    this.stopCamera();
    const requestId = ++this.cameraRequestId;
    this.setStatus("cameraRequest");
    const pending = requestCameraStream().then((stream) => {
      if (requestId !== this.cameraRequestId) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      this.preparedCameraStream = stream;
      return stream;
    }).catch((error) => {
      if (requestId === this.cameraRequestId) {
        this.setStatus(["NotAllowedError", "SecurityError"].includes(error?.name) ? "cameraDenied" : "cameraUnavailable");
      }
      return null;
    });
    this.preparedCameraPromise = pending;
    return pending;
  }

  stopCamera({ preservePrepared = false } = {}) {
    if (this.cameraStartTimer) this.cancelTimeout(this.cameraStartTimer);
    this.cameraStartTimer = 0;
    if (!preservePrepared) this.cameraRequestId += 1;
    cancelAnimationFrame(this.scanFrame);
    this.scanFrame = 0;
    this.detector = null;
    this.detectionPaused = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (!preservePrepared) {
      const pending = this.preparedCameraPromise;
      const prepared = this.preparedCameraStream;
      this.preparedCameraPromise = null;
      this.preparedCameraStream = null;
      prepared?.getTracks().forEach((track) => track.stop());
      pending?.then((stream) => {
        if (stream && stream !== prepared) stream.getTracks().forEach((track) => track.stop());
      });
    }
    if (this.nodes.video) this.nodes.video.srcObject = null;
    this.nodes.scanner?.classList.remove("is-live");
  }

  detectQrWithFallback() {
    const video = this.nodes.video;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height || !this.scanContext) return null;
    const scale = Math.min(1, 720 / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    this.scanCanvas.width = targetWidth;
    this.scanCanvas.height = targetHeight;
    this.scanContext.drawImage(video, 0, 0, targetWidth, targetHeight);
    let frame = this.scanContext.getImageData(0, 0, targetWidth, targetHeight);
    let value = globalThis.jsQR(frame.data, targetWidth, targetHeight, { inversionAttempts: "attemptBoth" })?.data || null;
    if (value || Math.abs(width - height) < Math.min(width, height) * 0.15) return value;

    const sourceSize = Math.min(width, height);
    const cropSize = Math.min(640, sourceSize);
    this.scanCanvas.width = cropSize;
    this.scanCanvas.height = cropSize;
    this.scanContext.drawImage(
      video,
      Math.max(0, (width - sourceSize) / 2),
      Math.max(0, (height - sourceSize) / 2),
      sourceSize,
      sourceSize,
      0,
      0,
      cropSize,
      cropSize
    );
    frame = this.scanContext.getImageData(0, 0, cropSize, cropSize);
    value = globalThis.jsQR(frame.data, cropSize, cropSize, { inversionAttempts: "attemptBoth" })?.data || null;
    return value;
  }

  retryScanner() {
    if (!this.stream || (!this.detector && typeof globalThis.jsQR !== "function") || this.state !== "qr-scan") return;
    this.detectionPaused = false;
    this.setStatus("qrInvalid");
    cancelAnimationFrame(this.scanFrame);
    this.scanFrame = requestAnimationFrame((now) => this.detect(now));
  }
}

async function requestCameraStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    await configureCameraTrack(stream);
    return stream;
  } catch (error) {
    if (["NotAllowedError", "SecurityError"].includes(error?.name)) throw error;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    await configureCameraTrack(stream);
    return stream;
  }
}

async function configureCameraTrack(stream) {
  const track = stream.getVideoTracks?.()[0];
  const capabilities = track?.getCapabilities?.();
  if (capabilities?.focusMode?.includes?.("continuous")) {
    const applying = track.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] });
    await applying?.catch?.(() => {});
  }
}

function waitForVideoReady(video) {
  if (video.readyState >= 1 && video.videoWidth) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 1500);
    video.addEventListener("loadedmetadata", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function renderAvatar(node, avatar) {
  delete node.dataset.anonymous;
  const normalizedAvatar = normalizeAvatarChoice(avatar);
  const src = animatedFramesForAvatar(normalizedAvatar)[0] || normalizedAvatar;
  const image = new Image();
  image.decoding = "async";
  image.alt = "";
  image.src = src;
  image.onerror = () => {
    node.textContent = "◎";
  };
  node.replaceChildren(image);
  image.decode?.().catch(() => {});
}

function renderAnonymousAvatar(node) {
  node.dataset.anonymous = "true";
  const mark = document.createElement("span");
  mark.className = "webdrop-island__anonymous-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "?";
  node.replaceChildren(mark);
}

function formatAcousticStatus(acoustic = {}, { fallback, translate }) {
  const mode = acoustic?.mode;
  const slotLabel = formatAcousticSlot(acoustic);
  const band = formatFrequencyBand(acoustic);
  const margin = Number(acoustic?.marginDb);
  const marginLabel = Number.isFinite(margin) && margin > 0 ? ` +${Math.round(margin)}dB` : "";
  const emittedCount = Number(acoustic?.emittedCount);
  const countLabel = Number.isFinite(emittedCount) && emittedCount > 0 ? ` x${emittedCount}` : "";
  const keyByMode = {
    emit: "ceremonyAudioEmitting",
    emitted: "ceremonyAudioEmitted",
    "emit-failed": "ceremonyAudioEmitFailed",
    listen: "ceremonyAudioListening",
    detected: "ceremonyDetected",
    "energy-assisted": "ceremonyEnergyHeard",
    missed: "ceremonyMissed"
  };
  const key = acoustic?.energyAssisted ? "ceremonyEnergyHeard" : keyByMode[mode];
  if (!key) return fallback;
  return `${translate(key)}${slotLabel}${countLabel}${marginLabel}${band}`;
}

function formatAcousticSlot(acoustic = {}) {
  const missedCount = Number(acoustic?.missedCount);
  const slot = Number(acoustic?.slot);
  const slotCount = Number(acoustic?.slotCount);
  if (Number.isFinite(missedCount) && missedCount > 1) return ` ${missedCount} slots`;
  if (Number.isFinite(slot) && Number.isFinite(slotCount)) return ` ${slot}/${slotCount}`;
  return "";
}

function formatFrequencyBand(acoustic = {}) {
  const start = Number(acoustic?.startFrequencyHz);
  const end = Number(acoustic?.endFrequencyHz);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  return ` ${Math.round(start / 100) / 10}-${Math.round(end / 100) / 10}kHz`;
}

function qrFinderColor(row, column, count, colors) {
  if (row < 7 && column < 7) return colors[0];
  if (row < 7 && column >= count - 7) return colors[1];
  if (row >= count - 7 && column < 7) return colors[2];
  return "";
}

// Decoded avatar images keyed by source so the QR badge is composited instantly
// on repeat shows without re-fetching/decoding.
const qrLogoCache = new Map();

function loadQrLogo(src) {
  if (!src || typeof Image === "undefined") return Promise.resolve(null);
  const existing = qrLogoCache.get(src);
  if (existing) {
    if (existing.complete) return Promise.resolve(existing.naturalWidth ? existing : null);
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(existing.naturalWidth ? existing : null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
    });
  }
  const image = new Image();
  image.decoding = "async";
  image.alt = "";
  qrLogoCache.set(src, image);
  const settled = new Promise((resolve) => {
    image.addEventListener("load", () => resolve(image.naturalWidth ? image : null), { once: true });
    image.addEventListener("error", () => {
      qrLogoCache.delete(src);
      resolve(null);
    }, { once: true });
  });
  image.src = src;
  return settled;
}

function traceRoundedRect(context, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

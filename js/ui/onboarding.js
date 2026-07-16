import { Emitter } from "../utils/emitter.js?v=1.0.125";

// Keep in lockstep with the bump keyframes in onboarding.css: the cycle is
// 2.8s and the avatars touch at 32% of it — that's when the thud plays.
const BUMP_CYCLE_MS = 2800;
const BUMP_CONTACT_MS = Math.round(BUMP_CYCLE_MS * 0.32);

// "How to use WebDrop" guided tour: a swipeable card carousel presented as a
// bottom sheet (same slide-up motion as the app's other sheets). NEVER
// auto-shown — it opens only from the how-to FAB (bottom-left), so the
// feature ships disabled by default. The final slide deliberately reuses the
// app's swipe-control gesture (with a synthesized start chime) instead of a
// plain button: finishing the guide rehearses the same muscle memory the
// send flow uses.
export class OnboardingTour extends Emitter {
  constructor(document, { translate, bindSwipe, setBackgroundInert } = {}) {
    super();
    this.document = document;
    this.translate = translate || ((key) => key);
    this.setBackgroundInert = setBackgroundInert || (() => {});
    this.root = document.querySelector("[data-onboarding]");
    this.nodes = {
      card: this.root?.querySelector("[data-onboarding-card]"),
      track: this.root?.querySelector("[data-onboarding-track]"),
      dots: this.root?.querySelector("[data-onboarding-dots]"),
      close: this.root?.querySelector("[data-onboarding-close]"),
      backdrop: this.root?.querySelector("[data-onboarding-backdrop]"),
      prev: this.root?.querySelector("[data-onboarding-prev]"),
      next: this.root?.querySelector("[data-onboarding-next]"),
      bumpScene: this.root?.querySelector(".onboarding__scene--bump"),
      swipeControl: this.root?.querySelector("[data-onboarding-swipe]"),
      swipeThumb: this.root?.querySelector("[data-onboarding-swipe-thumb]"),
      swipeText: this.root?.querySelector("[data-onboarding-swipe-text]")
    };
    this.previousFocus = null;
    this.audioContext = null;
    this.activeSlide = 0;
    this.dotSyncFrame = 0;
    this.dotSyncTimer = 0;
    this.finishTimer = 0;
    this.hideTimer = 0;
    this.bumpTimer = 0;
    this.bumpInterval = 0;
    if (!this.root || !this.nodes.track) return;
    this.slideCount = this.nodes.track.children.length;
    this.renderDots(0);
    this.nodes.close?.addEventListener("click", () => this.close());
    this.nodes.backdrop?.addEventListener("click", () => this.close());
    // Pointer-device pagination (mice can't swipe): chevrons beside the dots,
    // shown by CSS only on hover-capable fine pointers.
    this.nodes.prev?.addEventListener("click", () => this.scrollToSlide(this.activeSlide - 1));
    this.nodes.next?.addEventListener("click", () => this.scrollToSlide(this.activeSlide + 1));
    this.document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.root.hidden) this.close();
    });
    this.nodes.track.addEventListener("scroll", () => this.scheduleDotSync(), { passive: true });
    // Background-tab throttling lets the thud timers drift from the CSS
    // animation clock (which never pauses); restarting the loop on return
    // rewinds the animations and re-anchors the timers in one move.
    this.document.addEventListener("visibilitychange", () => {
      if (!this.document.hidden && this.root.dataset.open && this.activeSlide === 1) this.startBumpLoop();
    });
    if (this.nodes.swipeControl && typeof bindSwipe === "function") {
      // Same binder as "Swipe up to send" — identical drag physics, keyboard
      // path, and completion threshold. Completion emits "onboarding-start" on
      // the AppView, which calls finish().
      this.resetStartSwipe = bindSwipe({
        control: this.nodes.swipeControl,
        thumb: this.nodes.swipeThumb,
        text: this.nodes.swipeText,
        axis: "x",
        defaultText: "onboardingSwipeStart",
        completeText: "onboardingStarted",
        eventName: "onboarding-start"
      });
    }
  }

  open() {
    if (!this.root) return;
    globalThis.clearTimeout(this.finishTimer);
    globalThis.clearTimeout(this.hideTimer);
    this.previousFocus = this.document.activeElement;
    this.root.hidden = false;
    // The FAB tap is a user gesture — unlock audio now so the bump thud on
    // slide 2 (reached by scrolling, which is not always an activation) and
    // the finish chime are both allowed to play.
    this.ensureAudioContext();
    // Force a style flush between un-hiding and data-open so the card
    // actually transitions up from the bottom instead of popping in place.
    this.root.getBoundingClientRect();
    this.root.dataset.open = "true";
    this.setBackgroundInert(true);
    this.resetStartSwipe?.();
    // A leaked loop from a previous open would otherwise survive here,
    // because activeSlide is force-reset below and syncDots only toggles the
    // loop on slide CHANGES.
    this.stopBumpLoop();
    // Plain scrollLeft, not scrollTo({behavior:"instant"}): older WebKit
    // rejects the enum value and the resulting throw would abort open()
    // half-initialized.
    this.nodes.track.scrollLeft = 0;
    this.activeSlide = 0;
    this.renderDots(0);
    // Scroll events can be throttled or swallowed entirely (embedded webviews,
    // backgrounded tabs), so a low-rate poll keeps the dots honest while open;
    // the scroll listener still gives instant response where events do fire.
    globalThis.clearInterval(this.dotSyncTimer);
    this.dotSyncTimer = globalThis.setInterval(() => this.syncDots(), 200);
    this.nodes.close?.focus({ preventScroll: true });
  }

  close() {
    if (!this.root || this.root.hidden || !this.root.dataset.open) return;
    globalThis.clearTimeout(this.finishTimer);
    globalThis.clearInterval(this.dotSyncTimer);
    this.dotSyncTimer = 0;
    this.stopBumpLoop();
    // Dropping data-open slides the card back down and fades the backdrop;
    // hide the dialog only after that outro has played. The 320ms delay must
    // stay >= --motion-sheet-out (240ms) in base.css or the card vanishes
    // mid-slide.
    delete this.root.dataset.open;
    this.setBackgroundInert(false);
    globalThis.clearTimeout(this.hideTimer);
    this.hideTimer = globalThis.setTimeout(() => {
      this.root.hidden = true;
    }, 320);
    if (this.previousFocus?.focus && this.document.contains(this.previousFocus)) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.previousFocus = null;
  }

  // Called when the final slide's swipe completes: reward the gesture (chime +
  // haptic), let the filled "Let's go!" track read for a beat, then glide the
  // sheet away (close() animates the outro, so the whole exit is one motion).
  finish() {
    this.playStartChime();
    try {
      navigator.vibrate?.([14, 60, 22]);
    } catch {
      // Haptics are a garnish.
    }
    globalThis.clearTimeout(this.finishTimer);
    this.finishTimer = globalThis.setTimeout(() => this.close(), 420);
  }

  // rAF only COALESCES bursty scroll events; the open() poll calls syncDots()
  // directly — rAF can be suspended outright (hidden/embedded pages), and a
  // dropped frame here must not deadlock the pending-frame guard.
  scheduleDotSync() {
    if (this.dotSyncFrame) return;
    this.dotSyncFrame = globalThis.requestAnimationFrame(() => {
      this.dotSyncFrame = 0;
      this.syncDots();
    });
  }

  scrollToSlide(index) {
    const clamped = Math.max(0, Math.min(this.slideCount - 1, index));
    this.nodes.track.scrollTo({ left: clamped * this.nodes.track.clientWidth, behavior: "smooth" });
  }

  syncDots() {
    // A smooth dot-click scroll keeps emitting scroll events through the
    // close outro; reacting to one after close would arm the bump loop on a
    // hidden dialog with nothing left to ever stop it.
    if (!this.root.dataset.open) return;
    const track = this.nodes.track;
    const width = track.clientWidth || 1;
    const index = Math.max(0, Math.min(this.slideCount - 1, Math.round(track.scrollLeft / width)));
    if (index !== this.activeSlide) {
      this.activeSlide = index;
      if (index === 1) this.startBumpLoop();
      else this.stopBumpLoop();
    }
    this.renderDots(index);
  }

  renderDots(activeIndex) {
    const dots = this.nodes.dots;
    if (!dots) return;
    if (dots.children.length !== this.slideCount) {
      dots.replaceChildren(...Array.from({ length: this.slideCount }, (_, index) => {
        const dot = this.document.createElement("button");
        dot.type = "button";
        dot.className = "onboarding__dot";
        dot.addEventListener("click", () => {
          this.nodes.track.scrollTo({ left: index * this.nodes.track.clientWidth, behavior: "smooth" });
        });
        return dot;
      }));
    }
    if (this.nodes.prev) this.nodes.prev.disabled = activeIndex <= 0;
    if (this.nodes.next) this.nodes.next.disabled = activeIndex >= this.slideCount - 1;
    [...dots.children].forEach((dot, index) => {
      const active = index === activeIndex;
      dot.dataset.active = String(active);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
      // Refreshed on every render so a Settings language switch reaches the
      // labels — these buttons carry no data-i18n-aria for the global sweep.
      dot.setAttribute("aria-label", this.translate("onboardingGoToSlide", { number: index + 1 }));
    });
  }

  // While the bump slide is front and center, play the thud each time the
  // avatars touch. The CSS animations are rewound to phase zero first so the
  // sound and the collision stay in sync no matter when the slide is reached.
  startBumpLoop() {
    this.stopBumpLoop();
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // The in-app Settings motion toggle pauses all scene animation via
    // [data-motion="paused"] on the app shell — no animation, no thud.
    if (this.root.closest('[data-motion="paused"]')) return;
    try {
      this.nodes.bumpScene?.getAnimations?.({ subtree: true }).forEach((animation) => {
        animation.currentTime = 0;
      });
    } catch {
      // If the animations can't be rewound the loop just plays slightly
      // out of phase — not worth breaking the slide over.
    }
    const thud = () => {
      if (!this.document.hidden) this.playBumpThud();
    };
    this.bumpTimer = globalThis.setTimeout(() => {
      thud();
      this.bumpInterval = globalThis.setInterval(thud, BUMP_CYCLE_MS);
    }, BUMP_CONTACT_MS);
  }

  stopBumpLoop() {
    globalThis.clearTimeout(this.bumpTimer);
    globalThis.clearInterval(this.bumpInterval);
    this.bumpTimer = 0;
    this.bumpInterval = 0;
  }

  ensureAudioContext() {
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return null;
      this.audioContext ||= new Ctx();
      // resume() is async — a rejection would escape this try/catch as an
      // unhandled promise, so swallow it explicitly.
      if (this.audioContext.state === "suspended") this.audioContext.resume?.()?.catch?.(() => {});
      return this.audioContext;
    } catch {
      return null;
    }
  }

  // The bump's signature sound: a low felt-mallet thud (the phones touching)
  // followed by a tiny rising water-drop "bloop" (the ripple spreading).
  // Synthesized on the spot and kept quiet — it plays on a loop.
  playBumpThud() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.value = 0.09;
      master.connect(ctx.destination);
      const thud = ctx.createOscillator();
      thud.type = "sine";
      thud.frequency.setValueAtTime(150, now);
      thud.frequency.exponentialRampToValueAtTime(58, now + 0.14);
      const thudGain = ctx.createGain();
      thudGain.gain.setValueAtTime(0, now);
      thudGain.gain.linearRampToValueAtTime(1, now + 0.008);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      thud.connect(thudGain);
      thudGain.connect(master);
      thud.start(now);
      thud.stop(now + 0.24);
      const drop = ctx.createOscillator();
      drop.type = "sine";
      drop.frequency.setValueAtTime(430, now + 0.05);
      drop.frequency.exponentialRampToValueAtTime(980, now + 0.22);
      const dropGain = ctx.createGain();
      dropGain.gain.setValueAtTime(0, now + 0.05);
      dropGain.gain.linearRampToValueAtTime(0.4, now + 0.08);
      dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      drop.connect(dropGain);
      dropGain.connect(master);
      drop.start(now + 0.05);
      drop.stop(now + 0.34);
    } catch {
      // Sound is a garnish — never let it break the flow.
    }
  }

  // A soft two-note rise (E5 -> B5) synthesized on the spot — no audio asset,
  // and it runs inside the swipe's user gesture so autoplay policies allow it.
  playStartChime() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.value = 0.14;
      master.connect(ctx.destination);
      for (const [frequency, at, length] of [[659.25, 0, 0.34], [987.77, 0.09, 0.46]]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + at);
        gain.gain.linearRampToValueAtTime(1, now + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + at + length);
        osc.connect(gain);
        gain.connect(master);
        osc.start(now + at);
        osc.stop(now + at + length + 0.05);
      }
    } catch {
      // Sound is a garnish — never let it break the flow.
    }
  }
}
